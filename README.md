# ImageX

ImageX 是一个本地优先的多协议图像生成与编辑控制台，支持 OpenAI 兼容协议和 Gemini 协议。

> [!IMPORTANT]
> **来源与免责声明**
>
> ImageX 基于开源项目 [CPA Image](https://github.com/codegrazier/cpa-image) 二次开发。感谢原作者和贡献者提供的基础项目。
>
> 本项目当前仅供学习、研究和技术测试使用，不构成任何商业服务或商业授权。项目发布方明确禁止将本项目或其构建产物打包、转售、出租、二次收费部署或用于其他未经授权的商业化分发。下载、部署或测试本项目后，请在 24 小时内删除相关代码、构建产物和测试数据。
>
> 本项目及上游 CPA Image 使用 MIT License。MIT License 在其适用范围内允许复制、修改、分发和商业使用；本段声明表达的是 ImageX 发布方的使用要求，不能单方面否定 MIT License 已授予的权利。如果需要具有强制法律效力的非商业许可证，应由版权所有者另行制定并进行专业法律审查，同时不能限制上游 MIT 代码的既有许可权利。

界面使用 React、TypeScript、Vite、Tailwind CSS 和 shadcn/ui 构建。应用本身不提供后端服务，所有请求都从浏览器发往用户配置的 OpenAI 兼容 API 地址。

## 核心功能

- 生成与编辑：支持文字生成图片、选择本地图片编辑、复用历史结果作为编辑输入；Gemini 当前支持文生图，图生图会明确提示暂未适配。
- 图生图遮罩：可在参考图缩略图上打开遮罩编辑器，使用画笔标记需要修改的区域并导出 PNG mask 随编辑请求发送。
- 多协议供应商：内置灵速、Auttyt、MHOO 和 Gemini，可新增、删除、备注和随时切换供应商。
- 多接口调试：OpenAI 兼容协议支持 `/v1/images/generations`、`/v1/images/edits`、`/v1/responses`、`/v1/chat/completions`；Gemini 使用 `generateContent`。
- 队列控制：支持批量请求、并发数量、请求间隔、取消运行中请求、清理失败或已完成请求。
- 本地工作流：支持 Prompt 历史、置顶、复用、图片下载、批量导出 ZIP、响应 JSON 查看和六类电商产品套图任务；产品实拍参考图与商业素材都支持拖拽、粘贴和批量上传多张图片。
- 结果状态：主结果面板显示当前供应商、协议、可用性、并发、间隔和 API 延迟；配置完整后浏览器每 60 秒最多自动探测一次，页面隐藏时暂停，手动刷新也受同一冷却限制。
- 流式生成：对支持 SSE/partial_images 的 OpenAI 兼容供应商可开启流式请求，保持长连接并解析最终事件结果。
- 国际化：支持中文和英文界面，并在地址路径中保留语言状态。

## ImageX 的扩展方向

ImageX 以 [CPA Image](https://github.com/codegrazier/cpa-image) 的 OpenAI 兼容图像控制台为基础，继续围绕“本地优先”和高频出图工作流进行扩展。两者共享 OpenAI 兼容 API 的基础思路，ImageX 当前重点增加了以下面向实际创作流程的能力：

- 产品套图工作流：将主图、白底图、详情图、尺寸图、细节图和场景图组织成一个可编辑、可重复生成的任务。
- 图片标注重生：在结果图上使用画笔、箭头、矩形、圆形和文字标记修改建议；画布会在原图外扩展白色标注区，支持外部文字、文字字号、文字再次编辑、撤回和恢复。
- 结果管理：结果列表支持筛选、多选、删除、单图下载和多图 ZIP 导出，便于整理批量生成结果。
- 多协议配置：每个供应商独立保存协议、地址、Key 与模型；协议选项为 OpenAI 和 Gemini，左侧用颜色区分协议类型。
- 配置恢复：可在当前供应商右上角恢复默认参数；完全清除仍用于清理整个浏览器中的配置、任务、图片和提示词记录。
- 直连状态：主结果面板按连接状态和延迟显示“待检测、可用、较慢、不可用”等标签。
- 浏览器端隐私：设置、提示词历史、任务记录、图片缓存和导出操作均在浏览器本地完成，不需要 ImageX 自建业务后端。
- 本地开发辅助：开发环境提供占位图和测试数据，生产构建会自动关闭开发模式并移除占位图资源。

这些扩展是为了适配更完整的产品创作和批量整理场景，具体的设计记录与后续计划见项目计划文档。

## 文档

- [Debian 12 + 宝塔部署教程](./DEBIAN12_DEPLOY_CN.md)：生产环境静态部署、HTTPS、Nginx 路由和 CORS 配置。
- [项目概况与开发计划](./next_plan.txt)：当前架构、已完成工作、技术风险和后续计划。

## 开发

建议使用 Node.js `24` 或更高版本；如果使用 nvm，可以直接运行 `nvm use` 读取 `.nvmrc` 中的推荐版本。Node < 24 的 undici `Blob` 与 jsdom 在测试环境下不互通，会导致 `npm test` 中 URL 图片转 blob 的用例失败。

项目源码采用 MIT License，并保留 CPA Image 的上游许可声明；`package.json` 中的 `private: true` 用于避免误发布为 npm 包。

```bash
npm install
npm start
```

默认开发地址是 `http://127.0.0.1:3098`。

## 构建生产文件

GitHub 仓库默认不提交 `dist`，因为它是每次构建生成的临时产物。需要部署时，在源码目录执行：

```bash
npm install
npm run build
```

构建成功后，项目根目录会出现 `dist/`。把 `dist/` 内的全部文件上传到宝塔网站根目录即可；不要把 `dist` 再套一层目录。完整的 Debian 12 + 宝塔步骤见 [部署教程](./DEBIAN12_DEPLOY_CN.md)。

## 配置

页面默认 OpenAI 兼容 API URL 是内置灵速供应商的 `https://lingsu.xyz/v1`。内置供应商示例地址包括灵速 `https://lingsu.xyz/v1`、Auttyt `https://www.auttyt.top/v1` 和 MHOO `https://api.mhoo.cc/v1`。如果你的代理或兼容服务部署在其他地址，可以直接填写根地址，例如 `https://proxy.example.com`，应用会按功能自动拼接接口路径：

- 图片生成：`/v1/images/generations`
- 图片编辑：`/v1/images/edits`
- Responses：`/v1/responses`
- Chat Completions：`/v1/chat/completions`
- 连接测试：`/v1/models`

Gemini 供应商默认使用 `https://generativelanguage.googleapis.com/v1beta`，请求会自动拼接 `models/{模型}:generateContent`，API Key 作为 URL 参数发送。Gemini 图生图暂未适配，请使用 OpenAI 兼容协议。

## 本地数据

ImageX 会把设置、Prompt 历史、请求摘要和请求详情保存在当前浏览器本地，用于刷新后恢复工作区。API Key 只有在勾选“在本浏览器记住 API Key”后才会持久化保存。

项目不会主动把本地缓存上传到第三方服务。导出 ZIP、下载图片和查看响应 JSON 都在浏览器端完成。

## 跨域要求

ImageX 不提供中转代理，所有 API 请求都由浏览器直接发送到用户配置的服务。目标 API 必须正确配置 CORS，否则浏览器会阻止请求。

开发时也可以使用 Vite 同源代理绕过浏览器 CORS：先设置环境变量
`IMAGEX_API_PROXY_TARGET=https://api.example.com/v1`，再启动 `start-dev.cmd`（或执行
`npm.cmd run start`）。在设置页将 OpenAI API 地址填写为 `/api-proxy`，请求会转发到目标地址。
该代理仅存在于开发服务器，`npm.cmd run build` 生成的生产包不会包含代理服务或目标地址。

## 验证

```bash
npm test
npm run build
git diff --check
```

`npm run build` 会先执行 TypeScript 类型检查，再构建静态资源并运行预渲染脚本。

## 许可证

本项目采用 MIT License，详见 [`LICENSE`](./LICENSE)。其中包含来自 [CPA Image](https://github.com/codegrazier/cpa-image) 的上游版权和许可信息。
