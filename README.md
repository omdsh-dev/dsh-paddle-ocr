# dsh-paddle-ocr

DSH 插件：百度 **PaddleOCR-VL** 文档布局解析。把 PDF / 图片逐页解析为 Markdown
（文字 + 图片落盘），提供三个宿主工具、一个浏览器配置卡和一个任务面板。

- 宿主工具（agent 可用）：
  - `paddle_ocr_layout(file, {mode, fileType, orientation, unwarping, chart, visualize, outputDir})`
    —— 逐页解析落盘（`doc_N.md` + 图片），默认异步模式；超限 PDF 自动拆分；
    队列满（10010）自动指数退避重试（最多 5 次），最终仍满则给出友好排队提示。
  - `paddle_ocr_test()` —— 用内置小测试图验证 token 与接口连通性（✅/❌ + 详情）。
  - `paddle_split_pdf(file, {maxPages, outputDir})` —— 手动拆分超限 PDF。
- 浏览器 UI：
  - 设置 → 插件 → **PaddleOCR** 卡片：API token（只进 DSH 凭据保险箱，永不回传、
    输入框常空、只显示“已配置”徽章）、[测试连接] 按钮、处理默认值（异步/同步、
    方向矫正、展平、图表识别、可视化标注图）。
  - 右下角**任务面板**：拖入/选择文件 → 进度条（排队中 / 解析第 x 页 / 下载图片）→
    结果页签（Markdown 预览 + 图片缩略图）→ [落到工作区]。队列满（10010）渲染为
    “当前排队中（稍后重试）”按钮，而不是错误字符串。

## 安装

```bash
# 在 DSH 部署机上，把本包加入 web profile（同时打进 host 组合与浏览器 bundle）
dsh plugin --profile web add link:/path/to/dsh-paddle-ocr
```

插件自带 `dsh.bundle.patch`（组合插入行）与 `dsh.client` 声明；`dsh plugin` 会自动
把包名加入 `dsh.profile.bundles`。重启 `dsh web` 后生效。

## 获取 API token

1. 打开星河社区 <https://aistudio.baidu.com/paddleocr/task>；
2. 登录后进入 **个人中心 → 访问令牌（token）**；
3. 复制 token，粘贴到 设置 → 插件 → PaddleOCR 卡片，点保存，再点 [测试连接]。

也可以设置环境变量 `PADDLE_OCR_TOKEN`（环境变量优先、只读，卡片会显示只读徽章）。

> ⚠️ **安全提醒：请轮换你此前在 skill 仓库里使用过的 token。**
> 本插件的前身（paddle-ocr skill）曾在 `config.json` 中以明文写入过一个
> aistudio token 并进入 git 历史，视为已泄漏。**请勿继续使用该 token**：
> 到星河社区个人中心重新生成一个，并在该 skill 仓库中彻底删除旧文件、改写历史。
> 本插件从不把任何密钥写进代码、配置或日志——token 只存在于 DSH 凭据保险箱。

## API 限制与行为

| 模式 | 接口 | 限制 | 超限处理 |
| ---- | ---- | ---- | -------- |
| async（默认） | `POST https://paddleocr.aistudio-app.com/api/v2/ocr/jobs`（模型 PaddleOCR-VL-1.5） | 1000 页 / 本地 50MB | 自动拆分后逐份提交，页号全局连续 |
| sync | `POST https://b3kd6029kevcafkb.aistudio-app.com/layout-parsing` | 100 页 | 同上（100 页/份）；300s 超时 |

- 队列饱和是常态：提交返回 `errorCode 10010`（任务提交队列已满）时，工具与面板
  都会指数退避重试（2s/4s/8s/16s…最多 5 次）；重试耗尽后给出明确“排队中”提示，
  面板提供 [稍后重试] 按钮。
- 任务面板上传上限 30MB（回环 RPC 承载）；更大的文件请让 agent 用
  `paddle_ocr_layout` 工具直接处理。

## 开发

```bash
npm install --legacy-peer-deps        # 安装依赖（DSH 包走 workspace 软链）
DSH_WORKSPACE_ROOT=/path/to/dsh-source node scripts/setup-dsh-workspace.mjs
npm run typecheck                     # 宿主 + 客户端类型检查
npm test                              # vitest 单测（重试/拆分/测试图）
npm run build                         # lib/index.js（宿主）+ lib/client.js（浏览器）
```

客户端 bundle 由 `tsdown.config.ts` 构建（CJS + `__ModuleLoader__` 工厂），
CSS Modules 内联注入；宿主半是普通 tsc 输出。

## License

BSD-3-Clause
