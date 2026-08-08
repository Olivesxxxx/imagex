# ImageX

ImageX 是一个本地优先的 OpenAI 兼容图像生成与编辑控制台。

> [!IMPORTANT]
> **来源与免责声明**
>
> ImageX 基于开源项目 [CPA Image](https://github.com/codegrazier/cpa-image) 二次开发。感谢原作者和贡献者提供的基础项目。
>
> 本项目当前仅供学习、研究和技术测试使用，不构成任何商业服务或商业授权。项目发布方明确禁止将本项目或其构建产物打包、转售、出租、二次收费部署或用于其他未经授权的商业化分发。下载、部署或测试本项目后，请在 24 小时内删除相关代码、构建产物和测试数据。
>
> 本项目及上游 CPA Image 使用 MIT License。MIT License 在其适用范围内允许复制、修改、分发和商业使用；本段声明表达的是 ImageX 发布方的使用要求，不能单方面否定 MIT License 已授予的权利。如果需要具有强制法律效力的非商业许可证，应由版权所有者另行制定并进行专业法律审查，同时不能限制上游 MIT 代码的既有许可权利。

界面使用 React、TypeScript、Vite、Tailwind CSS 和 shadcn/ui 构建。应用本身不提供后端服务，所有请求都从浏览器发往用户配置的 OpenAI 兼容 API 地址。

## 功能

- 生成与编辑：支持文字生成图片、选择本地图片编辑、复用历史结果作为编辑输入。
- 多接口调试：支持 `/v1/images/generations`、`/v1/images/edits`、`/v1/responses`、`/v1/chat/completions`。
- 队列控制：支持批量请求、并发数量、请求间隔、取消运行中请求、清理失败或已完成请求。
- 本地工作流：支持 Prompt 历史、置顶、复用、图片下载、批量导出 ZIP、响应 JSON 查看。
- 国际化：支持中文和英文界面，并在地址路径中保留语言状态。

## 开发

建议使用 Node.js `24` 或更高版本；如果使用 nvm，可以直接运行 `nvm use` 读取 `.nvmrc` 中的推荐版本。Node < 24 的 undici `Blob` 与 jsdom 在测试环境下不互通，会导致 `npm test` 中 URL 图片转 blob 的用例失败。

项目源码采用 MIT License，并保留 CPA Image 的上游许可声明；`package.json` 中的 `private: true` 用于避免误发布为 npm 包。

```bash
npm install
npm start
```

默认开发地址是 `http://127.0.0.1:3098`。

## 配置

页面默认 API URL 是 `http://localhost:8317/v1`。如果你的代理或兼容服务部署在其他地址，可以直接填写根地址，例如 `https://proxy.example.com`，应用会按功能自动拼接接口路径：

- 图片生成：`/v1/images/generations`
- 图片编辑：`/v1/images/edits`
- Responses：`/v1/responses`
- Chat Completions：`/v1/chat/completions`
- 连接测试：`/v1/models`

## 本地数据

ImageX 会把设置、Prompt 历史、请求摘要和请求详情保存在当前浏览器本地，用于刷新后恢复工作区。API Key 只有在勾选“在本浏览器记住 API Key”后才会持久化保存。

项目不会主动把本地缓存上传到第三方服务。导出 ZIP、下载图片和查看响应 JSON 都在浏览器端完成。

## 跨域要求

ImageX 不提供中转代理，所有 API 请求都由浏览器直接发送到用户配置的服务。目标 API 必须正确配置 CORS，否则浏览器会阻止请求。

## 验证

```bash
npm test
npm run build
git diff --check
```

`npm run build` 会先执行 TypeScript 类型检查，再构建静态资源并运行预渲染脚本。

## 许可证

本项目采用 MIT License，详见 [`LICENSE`](./LICENSE)。其中包含来自 [CPA Image](https://github.com/codegrazier/cpa-image) 的上游版权和许可信息。
