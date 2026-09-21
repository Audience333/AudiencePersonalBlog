# Archive Portfolio Blog

一个可自行部署的「作品集 + 博客」模板。界面采用暖白档案库风格，内置账号系统、文章与作品后台、评论审核和点赞功能。

项目使用 Astro 的 Node.js 服务端渲染模式。页面、后端接口和管理后台都在同一个代码库中；数据保存在 SQLite 文件里，不需要额外安装 MySQL 或 PostgreSQL。

## 功能

- 响应式作品集、博客、关于页面和双主题切换
- 管理员登录与基于 Markdown 的文章编辑器
- 作品创建、草稿、发布、首页推荐和封面上传
- 访客注册、登录、文章点赞和评论
- 评论先审核后公开
- SQLite 持久化账号、会话、文章、作品、评论和点赞
- 密码使用 Node.js `scrypt` 加盐哈希保存
- 上传文件类型、文件签名和 4 MB 大小限制
- 同源表单校验、HttpOnly 会话 Cookie 和基础请求限流

## 技术栈

- Astro 7
- TypeScript
- Node.js 服务端适配器
- SQLite / better-sqlite3
- marked + sanitize-html
- 原生 CSS

## 本地运行

需要 Node.js 24.15 或更新版本。

```bash
git clone <你的仓库地址>
cd <仓库目录>
npm install
npm run dev
```

开发服务器默认使用 `http://localhost:4321`。首次访问时，程序会自动创建 `data/blog.sqlite`，并写入示例文章和示例作品。

## 创建管理员

注册页面创建的账号都是普通访客，不能进入后台。第一次运行时，在交互式终端执行：

```bash
npm run admin:create -- your-admin-name
```

命令会要求输入两次密码。用户名长度为 3–24 位，可使用中文、字母、数字、下划线和连字符；密码长度为 12–128 位。密码输入不会显示在终端中。

管理员创建完成后：

1. 打开 `/login/` 登录。
2. 访问 `/admin/` 进入管理后台。
3. 使用「写新文章」编辑 Markdown 文章。
4. 使用「上传作品」创建作品并上传封面。
5. 在后台审核访客提交的评论。

创建脚本只允许建立第一个管理员，不会覆盖已有管理员。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动开发服务器 |
| `npm run check` | 检查 Astro 页面和 TypeScript 类型 |
| `npm run build` | 生成 Node.js 生产构建 |
| `npm start` | 运行已经生成的生产构建 |
| `npm run test:integration` | 测试注册、权限、文章、作品、上传、评论和点赞流程 |
| `npm run admin:create -- <用户名>` | 创建第一个管理员 |

## 环境变量

所有变量都是可选的。本地开发不配置也可以运行。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `BLOG_DB_PATH` | `./data/blog.sqlite` | SQLite 数据库文件位置 |
| `BLOG_UPLOAD_DIR` | `./data/uploads` | 作品封面保存目录 |
| `PUBLIC_SITE_ORIGIN` | 当前请求来源 | 生产环境用于表单同源校验，例如 `https://example.com` |
| `HOST` | Astro 默认值 | 服务监听地址 |
| `PORT` | `4321` | 服务监听端口 |

生产环境示例：

```bash
npm install
npm run check
npm run build
PUBLIC_SITE_ORIGIN=https://example.com npm start
```

Windows PowerShell 设置变量的语法不同：

```powershell
$env:PUBLIC_SITE_ORIGIN = "https://example.com"
npm start
```

## 内容与数据

文章和作品以 SQLite 中的版本为准。管理员保存草稿后，访客无法访问；发布后立即生效，不需要重新构建网站。

以下内容不会提交到 Git：

- `data/blog.sqlite`：账号、文章、作品、评论、点赞和会话
- `data/uploads/`：后台上传的作品封面

迁移或备份网站时必须同时保留数据库和上传目录。SQLite 使用 WAL 模式；运行中备份时应使用 SQLite 在线备份方式，或者先停止服务再复制数据库相关文件。

## 项目结构

```text
src/
  layouts/               公共页面布局和导航
  lib/                   数据库、登录、Markdown 和上传逻辑
  pages/                 页面与服务端 API
    admin/               管理后台
    api/                 登录、文章、作品、评论、点赞和上传接口
  styles/global.css      全站主题与响应式样式
public/                  首页背景、图标等公开静态资源
scripts/create-admin.mjs 管理员创建脚本
tests/integration.mjs    完整流程集成测试
data/                    运行时数据，不提交到 Git
docs/deploy.md           部署说明
```

## 自定义模板

- 网站名称、导航和页脚：`src/layouts/BaseLayout.astro`
- 首页文案和档案编号：`src/pages/index.astro`
- 颜色、排版和响应式布局：`src/styles/global.css`
- 首页背景：`public/archive-hero-v1.png`
- 首页角色图片：`public/pikachu-official.png`
- 示例文章与作品：`src/lib/db.ts` 中的首次初始化数据

若修改首次初始化数据，已有数据库不会自动重置。请在空数据库上测试新初始化内容，不要直接删除仍包含正式内容的数据库。

## 部署要求

这个项目包含登录、数据库和文件上传，因此不能部署为纯静态网站。服务器需要：

- 持续运行 Node.js 24.15+
- 为 SQLite 和上传目录提供持久存储
- 使用 HTTPS
- 使用 Caddy、Nginx 等反向代理转发到 Node.js 服务
- 定期备份数据库和上传文件

更完整的上线步骤见 [部署说明](docs/deploy.md)。

## 品牌与素材说明

`public/pikachu-official.png` 来自 [Pokémon 官方图鉴](https://www.pokemon.com/uk/pokedex/pikachu)，仅用于本模板的视觉演示。Pokémon、Pikachu 及相关角色和素材的商标与版权归其权利人所有，该素材不随本项目代码获得开源授权。

如果你准备公开发布、商业使用或允许其他人复用此模板，请先确认你拥有相应素材的使用权，或者将该文件替换为你自己的原创角色图片。项目中的代码与第三方品牌素材应分别处理授权。

本仓库目前未附带代码开源许可证。公开到 GitHub 前，请根据你希望他人如何使用代码选择并添加许可证，例如 MIT License。

## 发布前检查

```bash
npm run check
npm run build
npm run test:integration
```

不要提交真实数据库、上传文件、管理员密码、Cookie 或 `.env` 文件。
