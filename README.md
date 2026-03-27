# Resume Workspace

一个本地文件驱动的简历工作台。

核心目标：

- 用 `resume.md` 维护简历内容
- 用 `resume.css` 维护简历样式
- 在浏览器里直接编辑这两个文件
- 实时预览最终简历
- 让本地 agent 或浏览器内 AI 修改真实文件
- 一键导出单页 PDF

这套结构的原则不变：`resume.md` 和 `resume.css` 永远是真实数据源。

## 文件结构

```text
.
├── build.mjs
├── package.json
├── resume-builder.mjs
├── resume.css
├── resume.md
├── serve.mjs
├── watch.mjs
├── web/
│   ├── editor.css
│   ├── editor.html
│   └── editor.js
└── output/
    ├── resume.html
    └── resume.pdf
```

## 安装与运行

先安装依赖：

```bash
npm install
```

启动本地工作台：

```bash
npm run serve:resume
```

浏览器打开：

```text
http://127.0.0.1:4173
```

## 当前功能

打开工作台后，你可以直接：

- 编辑 `Markdown`
- 编辑 `CSS`
- 自动保存到磁盘文件
- 自动重建预览
- 导出单页 PDF
- 在配置好模型后，通过浏览器内 AI 修改选中内容或整个当前文件

## 命令

```bash
npm run build:resume
npm run watch:resume
npm run serve:resume
```

### `npm run build:resume`

单次构建：

- 读取 `resume.md`
- 读取 `resume.css`
- 生成 `output/resume.html`

适合做快速构建或调试构建器。

### `npm run watch:resume`

监听文件变化并自动构建：

- 监听 `resume.md`
- 监听 `resume.css`
- 文件变化后自动重新生成 `output/resume.html`

适合你在终端或外部编辑器里直接改文件。

### `npm run serve:resume`

启动本地工作台和 API 服务，默认地址：

```text
http://127.0.0.1:4173
```

这个命令现在不只是静态预览，它还会提供：

- 浏览器编辑页面
- 文件读写 API
- 构建 API
- AI 编辑 API
- PDF 导出 API

## 浏览器工作流

页面布局分成三块：

- 左侧：`Markdown` 编辑器
- 中间：`CSS` 编辑器
- 右侧：简历预览

### 自动保存与预览

当前行为是：

1. 你编辑 `Markdown` 或 `CSS`
2. 停止输入约 `800ms`
3. 前端自动保存到 `resume.md` / `resume.css`
4. 服务端自动重新构建
5. 右侧预览自动刷新

也可以手动点击：

- `立即保存`
- `重建预览`

## 导出 PDF

点击页面右上角的 `导出单页 PDF` 按钮，会：

1. 先保存当前内容
2. 重新构建预览
3. 检查内容是否超出单页 A4
4. 生成 `output/resume.pdf`

如果当前内容超过单页，导出会失败，并提示你压缩内容或调整样式。

## AI 修改

推荐的主工作流仍然是：

- 用 Codex / Claude Code 直接修改 `resume.md`
- 用 Codex / Claude Code 直接修改 `resume.css`

这是最稳定、最适合大改和多版本演进的方式。

### 浏览器内 AI

页面里也提供两个按钮：

- `AI 修改 Markdown`
- `AI 修改 CSS`

行为：

- 如果你选中一段文本，AI 只改选中部分
- 如果没有选区，AI 会改整个当前文件

### 启用方式

启动前设置环境变量：

```bash
OPENAI_API_KEY=你的key npm run serve:resume
```

可选：

```bash
OPENAI_MODEL=gpt-4.1-mini OPENAI_API_KEY=你的key npm run serve:resume
```

如果你需要兼容别的 OpenAI 接口地址，也可以设置：

```bash
OPENAI_BASE_URL=https://your-endpoint.example/v1 OPENAI_API_KEY=你的key npm run serve:resume
```

如果没有配置 `OPENAI_API_KEY`，浏览器内 AI 功能会返回明确报错，但其他编辑和导出功能不受影响。

## 输出文件

构建输出：

- `output/resume.html`

PDF 输出：

- `output/resume.pdf`

## 推荐使用方式

### 方式一：浏览器工作台

```bash
npm install
npm run serve:resume
```

适合日常编辑、调样式、预览和导出。

### 方式二：agent 直接改文件

直接让本地 agent 修改：

- `resume.md`
- `resume.css`

然后再启动工作台查看效果，或者运行：

```bash
npm run build:resume
```

适合：

- 压缩全文表达
- 调整成单页
- 重写英文版
- 重做样式
- 后续扩展多版本

## 说明

- 这是本地单用户工具
- 默认不依赖数据库
- 浏览器页面只是编辑器，真实内容仍然在磁盘文件里
- Markdown 中允许混用少量 HTML 容器，以支持更稳定的布局
