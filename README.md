# Resume Builder

一个极简的本地简历构建工具。你只需要维护两个源文件：

- `resume.md`：简历内容
- `resume.css`：简历样式

构建后会生成一个可直接在浏览器中打开和打印的 HTML 文件：

- `output/resume.html`

这套结构的目标是把“内容”和“样式”都保留成普通文件，方便后续直接让 AI 修改。

## 文件结构

```text
.
├── build.mjs
├── package.json
├── resume.css
├── resume.md
├── serve.mjs
├── watch.mjs
└── output/
    └── resume.html
```

## 工作方式

`build.mjs` 会读取 `resume.md` 和 `resume.css`，生成一个完整的 `output/resume.html`。

生成后的 HTML：

- 可以直接双击用浏览器打开
- 可以通过本地静态服务器访问
- 可以直接使用浏览器的打印功能导出 PDF

## 命令

```bash
npm run build:resume
npm run watch:resume
npm run serve:resume
```

### `npm run build:resume`

单次构建简历：

- 读取 `resume.md`
- 读取 `resume.css`
- 生成 `output/resume.html`

适合改完内容后手动重建一次。

### `npm run watch:resume`

监听源文件变化并自动构建：

- 监听 `resume.md`
- 监听 `resume.css`
- 文件变化后自动重新生成 `output/resume.html`

适合一边改一边预览。

### `npm run serve:resume`

启动本地静态服务器，默认地址：

```text
http://127.0.0.1:4173
```

服务器默认会返回 `output/resume.html`，方便在浏览器中预览和打印。

## 推荐工作流

### 方式一：手动构建

```bash
npm run build:resume
npm run serve:resume
```

然后在浏览器打开 `http://127.0.0.1:4173`。

每次修改 `resume.md` 或 `resume.css` 后，再执行一次 `npm run build:resume`。

### 方式二：自动监听

终端 1：

```bash
npm run watch:resume
```

终端 2：

```bash
npm run serve:resume
```

然后浏览器打开 `http://127.0.0.1:4173`，每次修改源文件后刷新页面即可看到新结果。

## 打印为 PDF

1. 构建并打开简历预览页
2. 在浏览器中按打印快捷键
3. 选择“保存为 PDF”
4. 纸张选择 `A4`

打印样式已经在 `resume.css` 中控制。后续如果你想让简历更稳定地落在一页内，优先修改 `resume.css` 中的：

- 字号
- 行高
- section 间距
- 列表项间距
- `@media print` 规则

## 让 AI 修改

后续如果你要让 AI 继续调整简历，优先让它改这两个文件：

- `resume.md`
- `resume.css`

常见例子：

- “把 `resume.css` 调得更紧凑，适合一页 PDF”
- “把 `resume.css` 改得更像英文版简历”
- “把 `resume.md` 的项目经历压缩成更像校招简历的表达”

一般不需要改 `build.mjs`、`serve.mjs`、`watch.mjs`，除非你想扩展工具本身。

## 说明

- 这是一个本地工具，不依赖数据库或后端服务
- 默认不生成 `.pdf` 文件，而是通过浏览器打印导出
- Markdown 中允许混用少量 HTML 容器，以支持更稳定的简历布局
