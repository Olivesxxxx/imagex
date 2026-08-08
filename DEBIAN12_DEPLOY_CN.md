# ImageX：Debian 12 + 宝塔部署教程

ImageX 是纯浏览器前端项目。生产环境只需要把构建后的静态文件交给 Nginx（宝塔网站）提供访问，不需要 Node.js 常驻进程、PM2、PostgreSQL、Redis 或项目后端。

用户打开网页后，界面渲染、图片预览、标注、历史记录和 ZIP 导出都在用户自己的浏览器中完成。生图请求也由用户浏览器直接发送到用户填写的 OpenAI 兼容 API 地址，ImageX 服务器不接收或保存用户的提示词、API Key、任务记录和图片。

## 1. 部署前提

服务器：Debian 12，已安装宝塔面板和 Nginx。

域名建议使用 HTTPS，例如：

```text
https://imagex.example.com
```

生产服务器不需要安装 Node.js。如果准备在服务器上拉取源码并构建，则需要 Node.js 24 或更高版本；更推荐在本地完成构建，只上传 `dist` 目录。

## 2. 本地构建（推荐）

在 Windows 项目目录执行：

```powershell
cd D:\Projects\imagex
npm.cmd install
npm.cmd run build
```

构建成功后会生成：

```text
dist/
```

`dist` 是可以直接部署的网站文件。不要把以下内容上传到生产网站根目录：

```text
node_modules/
src/
tests/
.git/
.env*
```

ImageX 没有生产环境变量文件。API URL、API Key 和其他参数由用户在浏览器设置中填写，并保存在用户自己的浏览器本地。

## 3. 在宝塔创建网站

1. 打开宝塔面板的“网站”页面，点击“添加站点”。
2. 填写域名，例如 `imagex.example.com`。
3. PHP 版本选择“纯静态”或“不创建 PHP 项目”。
4. 网站根目录建议使用：

```text
/www/wwwroot/imagex
```

5. 创建完成后，删除目录中宝塔生成的默认 `index.html`（如果存在）。
6. 将本地 `dist` 目录中的全部内容上传到 `/www/wwwroot/imagex`，注意是上传 `dist` 里面的文件，而不是再套一层 `dist`：

```text
/www/wwwroot/imagex/index.html
/www/wwwroot/imagex/assets/
/www/wwwroot/imagex/zh-CN/
/www/wwwroot/imagex/en-US/
```

如果使用宝塔文件管理器上传 ZIP，请先上传到临时目录，解压后把其中的 `dist` 内容移动到网站根目录。

## 4. 配置 HTTPS

在宝塔网站的“SSL”页面申请并部署证书，开启 HTTPS。推荐开启“强制 HTTPS”。

HTTPS 很重要：

- 避免 API Key 在不安全的 HTTP 连接中传输。
- 浏览器从 HTTPS 页面请求 HTTP API 时，可能被混合内容策略阻止。
- 部分 API 或浏览器能力只允许在安全上下文中使用。

部署完成后，先访问：

```text
https://你的域名/zh-CN/
https://你的域名/en-US/
```

## 5. 配置静态路由回退

ImageX 的构建脚本会预渲染中文和英文入口，但仍建议配置 Nginx 回退，避免用户直接访问某个前端路径时出现 404。

在宝塔网站的“Nginx 配置”中，确认 `server` 块内的 `location /` 包含：

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

如果网站已有 `location /`，只修改该段，不要重复添加两个同级的 `location /`。保存后点击宝塔的“Nginx 配置测试”，确认通过，再重载 Nginx。

## 6. 配置 API 的跨域访问

ImageX 不提供 API 中转。用户浏览器会直接请求设置页面中填写的 API 地址，因此目标 API 必须允许来自 ImageX 网站域名的跨域请求（CORS）。

至少需要允许：

- `Origin: https://你的域名`
- `POST` 请求
- `Content-Type`、`Authorization`、`x-api-key` 等实际使用的请求头
- `OPTIONS` 预检请求

如果 API 服务支持通配符，可以临时使用 `Access-Control-Allow-Origin: *`，但正式环境建议明确填写 ImageX 域名。若浏览器控制台出现 `Failed to fetch`，优先检查 API 地址、HTTPS 和 CORS，而不是检查 ImageX 服务器的 Node 进程。

## 7. 部署后检查

依次检查：

1. `/zh-CN/` 和 `/en-US/` 都能打开，浏览器标签页显示 `ImageX`。
2. 刷新页面后仍能打开，不出现 Nginx 404。
3. 浏览器开发者工具的 Network 中，静态资源返回 `200`。
4. 在配置页填写 API URL 和 Key，使用“测试连接”。
5. API 允许 CORS 后，分别测试“文生图”和“图生图”。
6. 生成多张图片后，点击结果面板的“下载”，确认下载的是一个 ZIP。
7. 选择图片、导出 ZIP、标注和刷新页面后，确认数据仍在当前浏览器中。

## 8. 后续更新

推荐流程是“本地修改、测试、构建，再上传静态文件”：

```powershell
cd D:\Projects\imagex
npm.cmd install
npm.cmd test
npm.cmd run build
```

确认构建成功后，在宝塔文件管理器中：

1. 备份当前网站目录（可选，但建议保留上一版）。
2. 删除或覆盖 `/www/wwwroot/imagex` 中旧的构建文件。
3. 上传新 `dist` 目录中的全部内容。
4. 如果浏览器仍显示旧版本，清理站点缓存或执行强制刷新（Windows：`Ctrl+F5`）。

如果选择在 Debian 12 上构建源码：

```bash
cd /www/wwwroot/imagex-source
export PATH="/www/server/nodejs/v24/bin:/usr/bin:/bin:$PATH"
npm install
npm run build
```

然后把生成的 `dist` 内容同步到 `/www/wwwroot/imagex`。Node.js 只用于构建，构建完成后可以停止，不需要 PM2 托管。

## 9. 常见问题

### 页面能打开，但刷新后 404

检查第 5 节的 `try_files` 配置，并确认已测试和重载 Nginx。

### 页面能打开，但生图提示 `Failed to fetch`

这通常是 API URL 错误、API 服务不可达、HTTPS 混合内容或 CORS 配置问题。打开浏览器开发者工具，查看失败请求的 URL、状态和 CORS 报错。

### 服务器 CPU 或内存占用很低，是否正常

正常。ImageX 是静态前端，服务器不执行生图、不压缩图片、不打包 ZIP，也不保存用户任务。服务器主要消耗来自首次分发网页文件的带宽。

### 是否需要开放 3098 端口

不需要。`3098` 是本地开发服务器端口。宝塔生产部署使用 Nginx 的 `80/443` 端口，生产网站不运行 `npm run start`。

### 是否需要配置数据库、Node 项目或 PM2

不需要。那些配置属于带服务端和数据库的其他项目，不适用于 ImageX。

## 10. 安全提醒

- 不要把用户 API Key 写入源码、部署文档或 Git 仓库。
- 不要把 `.env`、日志、浏览器导出文件上传到网站公开目录。
- 生产环境使用 HTTPS。
- API Key 是否记住由用户自己决定；勾选记住后会保存在该用户浏览器本地。
- 如果未来新增服务端代理、登录、统计或云端存储，需要重新评估带宽、CPU、内存和隐私边界。
