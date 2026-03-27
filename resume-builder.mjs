import fs from "node:fs/promises";
import path from "node:path";

export function stripFrontmatter(source) {
  if (!source.startsWith("---\n")) {
    return source;
  }

  const end = source.indexOf("\n---\n", 4);
  return end === -1 ? source : source.slice(end + 5);
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function formatInline(text) {
  let output = escapeHtml(text);
  output = output.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  output = output.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  output = output.replace(/`([^`]+)`/g, "<code>$1</code>");
  return output;
}

function formatInlineHtml(text) {
  let output = text;
  output = output.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  output = output.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  output = output.replace(/`([^`]+)`/g, "<code>$1</code>");
  return output;
}

export function renderMarkdown(markdown) {
  const lines = stripFrontmatter(markdown).replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let paragraph = [];
  let inList = false;

  const flushParagraph = () => {
    if (paragraph.length === 0) {
      return;
    }

    html.push(`<p>${formatInline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  const closeList = () => {
    if (!inList) {
      return;
    }

    html.push("</ul>");
    inList = false;
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "") {
      flushParagraph();
      closeList();
      continue;
    }

    if (trimmed.startsWith("<")) {
      flushParagraph();
      closeList();
      html.push(formatInlineHtml(line));
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      closeList();
      const level = headingMatch[1].length;
      html.push(`<h${level}>${formatInline(headingMatch[2])}</h${level}>`);
      continue;
    }

    const listMatch = trimmed.match(/^- (.*)$/);
    if (listMatch) {
      flushParagraph();
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${formatInline(listMatch[1])}</li>`);
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  closeList();

  return html.join("\n");
}

export function buildDocument({ body, css, title = "姚子毅 - 简历预览" }) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
${css}
  </style>
</head>
<body>
${body}
</body>
</html>
`;
}

export function buildResume({ markdown, css, title }) {
  const body = renderMarkdown(markdown);
  const html = buildDocument({ body, css, title });
  return { body, html };
}

export async function readResumeSources(root) {
  const markdownPath = path.join(root, "resume.md");
  const cssPath = path.join(root, "resume.css");
  const [markdown, css] = await Promise.all([
    fs.readFile(markdownPath, "utf8"),
    fs.readFile(cssPath, "utf8"),
  ]);

  return { markdown, css, markdownPath, cssPath };
}

export async function writeResumeSources(root, { markdown, css }) {
  const markdownPath = path.join(root, "resume.md");
  const cssPath = path.join(root, "resume.css");
  await Promise.all([
    fs.writeFile(markdownPath, markdown, "utf8"),
    fs.writeFile(cssPath, css, "utf8"),
  ]);

  return { markdownPath, cssPath };
}

export async function writeResumeOutput(root, html) {
  const outputDir = path.join(root, "output");
  const outputPath = path.join(outputDir, "resume.html");
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputPath, html, "utf8");
  return outputPath;
}

export async function buildResumeFromDisk({ root, title }) {
  const { markdown, css } = await readResumeSources(root);
  const { html, body } = buildResume({ markdown, css, title });
  const outputPath = await writeResumeOutput(root, html);
  return { markdown, css, body, html, outputPath };
}
