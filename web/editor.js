const state = {
  markdown: "",
  css: "",
  saveTimer: null,
  isDirty: false,
  isSaving: false,
  activeMode: "markdown",
};

const $ = (id) => document.getElementById(id);

const elements = {
  markdownEditor: $("markdownEditor"),
  cssEditor: $("cssEditor"),
  saveStatus: $("saveStatus"),
  buildStatus: $("buildStatus"),
  messageStatus: $("messageStatus"),
  previewFrame: $("previewFrame"),
  previewLink: $("previewLink"),
  saveButton: $("saveButton"),
  buildButton: $("buildButton"),
  exportButton: $("exportButton"),
  aiActionButton: $("aiActionButton"),
  markdownTab: $("markdownTab"),
  cssTab: $("cssTab"),
  editorTitle: $("editorTitle"),
  editorKicker: $("editorKicker"),
  editorDescription: $("editorDescription"),
};

const modeConfig = {
  markdown: {
    title: "Markdown",
    kicker: "Content Draft",
    description: "适合写经历、结构和表达。支持选中一段后交给 AI 局部改写。",
    aiLabel: "AI 修改 Markdown",
  },
  css: {
    title: "CSS",
    kicker: "Style System",
    description: "适合压缩单页、调字体和控制打印布局。也支持用 AI 微调样式。",
    aiLabel: "AI 修改 CSS",
  },
};

function setStatus(element, text, className) {
  element.textContent = text;
  element.className = className || "";
}

function setMessage(text, type = "") {
  setStatus(elements.messageStatus, text, type);
}

function setActiveMode(mode) {
  state.activeMode = mode;
  const isMarkdown = mode === "markdown";
  elements.markdownEditor.classList.toggle("is-visible", isMarkdown);
  elements.cssEditor.classList.toggle("is-visible", !isMarkdown);
  elements.markdownTab.classList.toggle("is-active", isMarkdown);
  elements.cssTab.classList.toggle("is-active", !isMarkdown);
  elements.markdownTab.setAttribute("aria-selected", String(isMarkdown));
  elements.cssTab.setAttribute("aria-selected", String(!isMarkdown));
  elements.editorTitle.textContent = modeConfig[mode].title;
  elements.editorKicker.textContent = modeConfig[mode].kicker;
  elements.editorDescription.textContent = modeConfig[mode].description;
  elements.aiActionButton.textContent = modeConfig[mode].aiLabel;
}

function refreshPreview(previewUrl) {
  const nextUrl = previewUrl || `/preview?ts=${Date.now()}`;
  elements.previewFrame.src = nextUrl;
  elements.previewLink.href = nextUrl;
}

async function loadSource() {
  const response = await fetch("/api/source");
  if (!response.ok) {
    throw new Error("load_failed");
  }
  const payload = await response.json();
  state.markdown = payload.markdown;
  state.css = payload.css;
  elements.markdownEditor.value = payload.markdown;
  elements.cssEditor.value = payload.css;
  state.isDirty = false;
  setStatus(elements.saveStatus, "已加载", "status-saved");
  setStatus(elements.buildStatus, "预览可用", "status-saved");
  setMessage("源文件已加载，可以直接编辑。");
  refreshPreview(`/preview?ts=${Date.now()}`);
}

async function saveSource({ forceBuild = true } = {}) {
  if (state.isSaving) {
    return;
  }

  state.isSaving = true;
  setStatus(elements.saveStatus, "保存中", "status-saving");

  try {
    const response = await fetch("/api/source", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        markdown: elements.markdownEditor.value,
        css: elements.cssEditor.value,
        build: forceBuild,
      }),
    });
    const payload = await response.json();
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.message || "save_failed");
    }

    state.markdown = elements.markdownEditor.value;
    state.css = elements.cssEditor.value;
    state.isDirty = false;
    setStatus(elements.saveStatus, "已保存", "status-saved");
    setStatus(elements.buildStatus, forceBuild ? "预览已更新" : "已保存，未构建", "status-saved");
    setMessage(forceBuild ? "文件已保存并完成构建。" : "文件已保存。");
    if (payload.previewUrl) {
      refreshPreview(payload.previewUrl);
    }
  } catch (error) {
    setStatus(elements.saveStatus, "保存失败", "status-error");
    setStatus(elements.buildStatus, "构建失败", "status-error");
    setMessage(error.message || "保存失败。", "status-error");
    throw error;
  } finally {
    state.isSaving = false;
  }
}

function queueAutosave() {
  state.isDirty = true;
  setStatus(elements.saveStatus, "未保存", "status-saving");
  clearTimeout(state.saveTimer);
  state.saveTimer = window.setTimeout(() => {
    saveSource().catch(() => {});
  }, 800);
}

async function triggerBuild() {
  setStatus(elements.buildStatus, "构建中", "status-saving");
  const response = await fetch("/api/build", { method: "POST" });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    setStatus(elements.buildStatus, "构建失败", "status-error");
    setMessage(payload.message || "构建失败。", "status-error");
    return;
  }
  setStatus(elements.buildStatus, "预览已更新", "status-saved");
  setMessage("预览已重新构建。");
  refreshPreview(payload.previewUrl);
}

function getSelectionPayload(editor) {
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  if (start === end) {
    return null;
  }
  return { start, end };
}

async function runAiEdit(target) {
  const editor = target === "markdown" ? elements.markdownEditor : elements.cssEditor;
  const selection = getSelectionPayload(editor);
  const scopeLabel = selection ? "选中内容" : "整个当前文件";
  const instruction = window.prompt(`AI 将修改${scopeLabel}。请输入修改要求：`);
  if (!instruction || !instruction.trim()) {
    return;
  }

  setMessage(`AI 正在修改 ${target === "markdown" ? "Markdown" : "CSS"}...`);

  const response = await fetch("/api/ai/edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target,
      instruction: instruction.trim(),
      selection,
    }),
  });

  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    setMessage(payload.message || "AI 修改失败。", "status-error");
    return;
  }

  editor.value = payload.updatedContent;
  if (target === "markdown") {
    state.markdown = payload.updatedContent;
  } else {
    state.css = payload.updatedContent;
  }
  state.isDirty = false;
  setStatus(elements.saveStatus, "已保存", "status-saved");
  setStatus(elements.buildStatus, "AI 修改已生效", "status-saved");
  setMessage("AI 修改已写入文件并刷新预览。");
  refreshPreview(payload.previewUrl);
}

async function exportPdf() {
  if (state.isDirty) {
    await saveSource();
  }

  setMessage("正在导出 PDF...");
  const response = await fetch("/api/export/pdf", { method: "POST" });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    setMessage(payload.message || "导出 PDF 失败。", "status-error");
    return;
  }

  setMessage("PDF 已生成。");
  window.open(payload.file, "_blank", "noopener,noreferrer");
}

function bindEvents() {
  elements.markdownEditor.addEventListener("input", queueAutosave);
  elements.cssEditor.addEventListener("input", queueAutosave);
  elements.saveButton.addEventListener("click", () => saveSource().catch(() => {}));
  elements.buildButton.addEventListener("click", () => triggerBuild().catch(() => {}));
  elements.exportButton.addEventListener("click", () => exportPdf().catch(() => {}));
  elements.aiActionButton.addEventListener("click", () => runAiEdit(state.activeMode).catch(() => {}));
  elements.markdownTab.addEventListener("click", () => setActiveMode("markdown"));
  elements.cssTab.addEventListener("click", () => setActiveMode("css"));
}

bindEvents();
setActiveMode("markdown");
loadSource().catch(() => {
  setStatus(elements.saveStatus, "加载失败", "status-error");
  setStatus(elements.buildStatus, "不可用", "status-error");
  setMessage("读取源文件失败，请检查服务端日志。", "status-error");
});
