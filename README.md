# Archive Portfolio Blog

一个可自行部署的作品集与个人博客模板。网站、管理员后台、访客账号、评论与 SQLite 数据库都运行在同一个 Astro Node.js 应用中，适合从本地调试逐步迁移到自己的服务器。

## 截图

首页采用档案馆式版面，使用 WebP 首图并保留 PNG 后备。启动本地开发服务后可在 `http://localhost:4321/` 查看当前主题。

## 功能

- Markdown 写作、实时安全预览、草稿预览、文章图片和作品封面上传
- 计划发布、归档、单篇文章评论开关、目录、阅读进度、代码复制和相邻文章
- 访客注册、登录、点赞、评论审核、注册开关和关键词拦截
- 搜索、标签归档、分页、RSS、sitemap、规范链接、Open Graph 和结构化数据
- SQLite 自动迁移、健康检查、安全响应头、备份与 systemd/Caddy 部署范例

## 要求

需要 Node.js `24.15` 或更高版本，以及 Git。开发与生产环境都使用 Node.js；不需要另行安装 MySQL、Redis 或第三方 CMS。

## 快速开始

```bash
git clone https://github.com/Audience333/AudiencePersonalBlog.git
cd AudiencePersonalBlog
npm install
npm run dev
```

首次启动会自动建立 `data/blog.sqlite` 并写入示例内容。浏览器打开终端显示的网址，默认是 `http://localhost:4321/`。

## 集中修改网站信息

| 想修改的内容 | 位置 |
| --- | --- |
| 网站名、作者、时区、默认分享图 | `src/config/site.ts` |
| 首页的标题和介绍 | `src/pages/index.astro` |
| 颜色、排版和响应式样式 | `src/styles/global.css` |
| 皮卡丘演示素材 | `public/pikachu-official.png` |
| 首页背景图 | `public/archive-hero-v1.png` 与 `public/archive-hero-v1.webp` |

## 创建管理员

```bash
npm run admin:create -- your-admin-name
```

按提示设置密码后，访问 `/login/` 登录，再进入 `/admin/`。管理员可管理文章、作品、评论与网站设置。

## 写作流程

1. 在后台新建文章，输入标题、摘要、标签和 Markdown 正文。
2. 使用编辑器内的预览确认排版；上传图片后会自动生成可插入正文的 Markdown 链接。
3. 保存为草稿、直接发布，或选择未来的发布时间。
4. 草稿可通过管理员预览页查看，访客不会获得草稿网址。

## 访客功能

访客注册后可以登录、点赞和评论。管理员在后台审核评论；可在“网站设置”关闭新注册、设置默认评论状态和拦截关键词。

## 运行时设置

`.env.example` 列出了生产环境变量：

| 变量 | 用途 |
| --- | --- |
| `PUBLIC_SITE_ORIGIN` | 正式网址，用于同源校验、RSS、sitemap 和规范链接 |
| `BLOG_DB_PATH` | SQLite 数据库位置 |
| `BLOG_UPLOAD_DIR` | 上传图片目录 |
| `HOST` / `PORT` | 服务监听地址，部署示例为 `127.0.0.1:4321` |
| `NODE_ENV` | 生产环境设为 `production` |

Astro 不会在生产运行时自动读取项目根目录的 `.env`；部署范例通过 systemd 的 `/etc/personal-blog.env` 显式提供这些变量。

## 检查与构建

```bash
npm run check
npm run build
npm run test:unit
npm run test:integration
```

`npm run check` 检查 Astro 与 TypeScript，`npm run build` 生成可部署的服务端文件，两个测试命令分别检查核心逻辑和完整的登录、后台、公开页面流程。

## 生产部署

```bash
npm start
npm run backup -- --output data/backups
```

`npm start` 运行已经构建好的站点。完整的 Ubuntu、systemd、Caddy、HTTPS、备份、恢复、升级与回滚步骤见 [docs/deploy.md](docs/deploy.md)。生产环境必须把 `data/blog.sqlite` 和 `data/uploads/` 放在持久磁盘中。

## 备份、恢复与升级

备份命令会创建一个独立的时间戳目录，里面包含数据库、上传文件和清单。恢复或升级前先运行备份；详细操作和回滚步骤见部署文档。

## 项目结构

```text
src/config/       网站固定信息
src/pages/        公开页面、后台和 API
src/lib/          数据库、登录、文章、SEO 与业务逻辑
public/           图片和静态资源
scripts/          管理员创建、启动、备份和图片压缩
deploy/           systemd 与 Caddy 配置范例
docs/             部署说明
```

## Pokémon 素材

`public/pikachu-official.png` 只作主题演示。公开发布或商业使用前，请替换成你拥有使用授权的素材。
