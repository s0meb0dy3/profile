import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import {
  buildResumeFromDisk,
  readResumeSources,
  writeResumeSources,
} from "./resume-builder.mjs";

const root = process.cwd();
const port = Number(process.env.PORT || 4173);
const outputDir = path.join(root, "output");
const webDir = path.join(root, "web");
const outputHtmlPath = path.join(outputDir, "resume.html");
const outputPdfPath = path.join(outputDir, "resume.pdf");

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendError(res, statusCode, reason, message) {
  sendJson(res, statusCode, { ok: false, reason, message });
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("invalid_json");
  }
}

function getPreviewUrl() {
  return `/preview?ts=${Date.now()}`;
}

async function ensurePreviewBuilt() {
  try {
    await fs.access(outputHtmlPath);
  } catch {
    await buildResumeFromDisk({ root });
  }
}

async function serveFile(res, filePath) {
  const data = await fs.readFile(filePath);
  const ext = path.extname(filePath);
  res.writeHead(200, { "Content-Type": contentTypes[ext] || "application/octet-stream" });
  res.end(data);
}

function resolveWebAsset(urlPath) {
  const relativePath = urlPath.replace(/^\/assets\//, "");
  const assetPath = path.join(webDir, relativePath);
  const normalized = path.normalize(assetPath);
  if (!normalized.startsWith(webDir)) {
    return null;
  }
  return normalized;
}

async function saveAndBuild({ markdown, css }) {
  await writeResumeSources(root, { markdown, css });
  await buildResumeFromDisk({ root });
  return { previewUrl: getPreviewUrl() };
}

function applySelectionReplacement(source, selection, replacement) {
  if (!selection) {
    return replacement;
  }

  const { start, end } = selection;
  return source.slice(0, start) + replacement + source.slice(end);
}

async function runAiEdit({ target, instruction, selection }) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

  if (!apiKey) {
    const error = new Error("ai_not_configured");
    error.statusCode = 400;
    error.userMessage = "未配置 AI 接口，请使用本地 agent 修改文件，或配置 OPENAI_API_KEY。";
    throw error;
  }

  const { markdown, css } = await readResumeSources(root);
  const source = target === "markdown" ? markdown : css;
  const currentSelection = selection
    ? source.slice(selection.start, selection.end)
    : source;

  const scope = selection ? "selected fragment only" : "the entire current file";
  const kind = target === "markdown" ? "Markdown" : "CSS";

  const response = await fetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                `You edit ${kind} for a resume tool. Return strict JSON only with a single key named "replacement". ` +
                `Do not include markdown fences or commentary. Edit ${scope} and preserve the user's language.`,
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Instruction:\n${instruction}\n\nCurrent ${kind} content to replace:\n${currentSelection}`,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    const error = new Error(`ai_request_failed:${detail}`);
    error.statusCode = 502;
    error.userMessage = "AI 修改失败，模型接口没有返回可用结果。";
    throw error;
  }

  const payload = await response.json();
  const outputText = payload.output_text?.trim();
  if (!outputText) {
    const error = new Error("ai_empty_response");
    error.statusCode = 502;
    error.userMessage = "AI 修改失败，模型没有返回内容。";
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    const error = new Error("ai_invalid_json");
    error.statusCode = 502;
    error.userMessage = "AI 修改失败，模型返回格式不合法。";
    throw error;
  }

  if (typeof parsed.replacement !== "string" || parsed.replacement.length === 0) {
    const error = new Error("ai_invalid_replacement");
    error.statusCode = 502;
    error.userMessage = "AI 修改失败，模型返回的替换内容为空或格式不合法。";
    throw error;
  }

  const updatedContent = applySelectionReplacement(source, selection, parsed.replacement);
  const nextMarkdown = target === "markdown" ? updatedContent : markdown;
  const nextCss = target === "css" ? updatedContent : css;
  const { previewUrl } = await saveAndBuild({ markdown: nextMarkdown, css: nextCss });

  return { updatedContent, previewUrl };
}

async function exportPdf() {
  await ensurePreviewBuilt();

  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    const error = new Error("playwright_missing");
    error.statusCode = 500;
    error.userMessage = "PDF 导出依赖 Playwright，请先执行 npm install。";
    throw error;
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/preview?ts=${Date.now()}`, {
      waitUntil: "networkidle",
    });

    const measurement = await page.evaluate(() => {
      const shell = document.querySelector(".resume-shell");
      if (!shell) {
        return { ok: false, reason: "missing_shell" };
      }

      const mmToPx = (mm) => (mm * 96) / 25.4;
      const pageHeight = mmToPx(297);
      const shellHeight = shell.getBoundingClientRect().height;

      return {
        ok: true,
        shellHeight,
        pageHeight,
        overflow: shellHeight - pageHeight,
      };
    });

    if (!measurement.ok) {
      const error = new Error("missing_shell");
      error.statusCode = 500;
      error.userMessage = "预览页缺少 .resume-shell，无法判断单页导出。";
      throw error;
    }

    if (measurement.overflow > 8) {
      const error = new Error("content_overflow");
      error.statusCode = 400;
      error.userMessage = "当前内容超过单页 A4，请压缩内容或调整样式。";
      throw error;
    }

    await fs.mkdir(outputDir, { recursive: true });
    await page.pdf({
      path: outputPdfPath,
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });
  } finally {
    await browser.close();
  }

  return { file: "/output/resume.pdf" };
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/source") {
    try {
      const { markdown, css, markdownPath, cssPath } = await readResumeSources(root);
      const [markdownStat, cssStat] = await Promise.all([
        fs.stat(markdownPath),
        fs.stat(cssPath),
      ]);
      sendJson(res, 200, {
        markdown,
        css,
        updatedAt:
          markdownStat.mtimeMs > cssStat.mtimeMs
            ? markdownStat.mtime.toISOString()
            : cssStat.mtime.toISOString(),
      });
    } catch (error) {
      sendError(res, 500, "read_failed", "读取源文件失败。");
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/source") {
    try {
      const body = await readBody(req);
      if (typeof body.markdown !== "string" || typeof body.css !== "string") {
        sendError(res, 400, "invalid_payload", "保存失败，请同时提供 markdown 和 css 字符串。");
        return;
      }

      const { previewUrl } = body.build === false
        ? (await writeResumeSources(root, { markdown: body.markdown, css: body.css }), { previewUrl: null })
        : await saveAndBuild({ markdown: body.markdown, css: body.css });

      sendJson(res, 200, {
        ok: true,
        built: body.build !== false,
        previewUrl,
      });
    } catch (error) {
      if (error.message === "invalid_json") {
        sendError(res, 400, "invalid_json", "请求体不是合法 JSON。");
        return;
      }
      sendError(res, 500, "save_failed", "保存或构建失败。");
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/build") {
    try {
      await buildResumeFromDisk({ root });
      sendJson(res, 200, { ok: true, previewUrl: getPreviewUrl() });
    } catch {
      sendError(res, 500, "build_failed", "构建预览失败。");
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/ai/edit") {
    try {
      const body = await readBody(req);
      if (body.target !== "markdown" && body.target !== "css") {
        sendError(res, 400, "invalid_target", "AI 修改目标必须是 markdown 或 css。");
        return;
      }
      if (typeof body.instruction !== "string" || body.instruction.trim() === "") {
        sendError(res, 400, "invalid_instruction", "请输入 AI 修改指令。");
        return;
      }

      let selection = null;
      if (body.selection !== undefined) {
        const { start, end } = body.selection || {};
        if (
          !Number.isInteger(start) ||
          !Number.isInteger(end) ||
          start < 0 ||
          end < start
        ) {
          sendError(res, 400, "invalid_selection", "选区范围不合法。");
          return;
        }
        selection = { start, end };
      }

      const { updatedContent, previewUrl } = await runAiEdit({
        target: body.target,
        instruction: body.instruction.trim(),
        selection,
      });

      sendJson(res, 200, {
        ok: true,
        target: body.target,
        updatedContent,
        built: true,
        previewUrl,
      });
    } catch (error) {
      sendError(
        res,
        error.statusCode || 500,
        error.message.split(":")[0],
        error.userMessage || "AI 修改失败。"
      );
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/export/pdf") {
    try {
      const { markdown, css } = await readResumeSources(root);
      await saveAndBuild({ markdown, css });
      const result = await exportPdf();
      sendJson(res, 200, { ok: true, file: result.file });
    } catch (error) {
      sendError(
        res,
        error.statusCode || 500,
        error.message,
        error.userMessage || "导出 PDF 失败。"
      );
    }
    return;
  }

  sendError(res, 404, "not_found", "接口不存在。");
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);

  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    if (req.method !== "GET") {
      sendError(res, 405, "method_not_allowed", "仅支持 GET。");
      return;
    }

    if (url.pathname === "/") {
      await serveFile(res, path.join(webDir, "editor.html"));
      return;
    }

    if (url.pathname === "/preview") {
      await ensurePreviewBuilt();
      await serveFile(res, outputHtmlPath);
      return;
    }

    if (url.pathname === "/favicon.ico") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (url.pathname.startsWith("/assets/")) {
      const assetPath = resolveWebAsset(url.pathname);
      if (!assetPath) {
        sendError(res, 404, "not_found", "资源不存在。");
        return;
      }
      await serveFile(res, assetPath);
      return;
    }

    if (url.pathname === "/output/resume.pdf") {
      await serveFile(res, outputPdfPath);
      return;
    }

    // Keep static output html reachable for direct printing/debugging.
    if (url.pathname === "/output/resume.html") {
      await ensurePreviewBuilt();
      await serveFile(res, outputHtmlPath);
      return;
    }

    // Fallback for static local files used by the existing project.
    const filePath = path.join(root, path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ""));
    await serveFile(res, filePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    console.error(error);
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Internal server error");
  }
});

server.listen(port, "127.0.0.1", async () => {
  try {
    await ensurePreviewBuilt();
  } catch (error) {
    console.error("Initial build failed:", error);
  }
  console.log(`Resume workspace: http://127.0.0.1:${port}`);
});
