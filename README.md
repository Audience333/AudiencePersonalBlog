# 观众 · 莱茵档案终端

个人博客「观众 · 作品与博客」的新界面：把博客内容整编成莱茵生命终端风格的三维档案阵列。
界面基于开源项目 [RhineLabUI](https://github.com/LBEILC/RhineLabUI)（TypeScript + Three.js + Vite）搭建，
文章、项目、站点资料与互动数据继承自旧版 Astro 博客。

在线形态：白底开场 → 身份验证 → 五列循环档案阵列 → 抽取档案、玻璃解密 → 正文阅读、360° 模型查看、收藏与导出。

## 快速运行

需要 Node.js 22.12 或更高版本（推荐 Node.js 24）。

```bash
npm ci
npm run dev        # 开发，通常为 http://127.0.0.1:5173/
npm run build      # 产出 dist/，交给任意静态 HTTP 服务托管
npm run preview    # 本地预览构建产物
```

Windows 也可以双击 `启动终端.cmd`。

## 数据从哪来

档案内容不是手写进页面的，而是从博客数据生成：

1. `data/blog.sqlite` —— 旧版 Astro 博客的 SQLite 数据库（本地保留，不进 Git）。
   首篇已发布文章、首个已发布项目会被整编为旗舰档案（X-001、X-009）；
   留言簿、阅读数、访问统计等动态数据注入对应档案。
2. `content/site.json` —— 站点资料（名称、作者、简介、 motto 、链接、友链），从旧版站点配置继承。
3. 运行 `npm run export:blog` 读取以上两者，生成 `content/archives.json`
   （五类、每类八份、X-001 至 X-040）与 `content/stats.json`（首页统计）。
   随后 `npm run export:archives` 校验并导出 TXT 下载文件；
   `dev` / `build` 前会自动执行校验与导出。

在旧后台新增文章或项目后，重新执行 `npm run export:blog && npm run export:archives` 即可刷新档案。
修改站点资料直接编辑 `content/site.json`；首页个人面板（`src/profile.ts`）从中读取头像、署名、
简介、链接与统计。

档案布局固定为五类各八份，与三维循环阵列、编号稳定性（收藏与导出文件名）绑定；
校验规则见 `scripts/archive-content.mjs`，修改内容也可参考 `content/README.md`。

## 操作说明

- 开场按 Enter / Esc 或点击 ENTER SYSTEM 进入阵列。
- ← / → 切换档案列，↑ / ↓ 翻阅同列档案，首尾循环。
- Enter 或 ACCESS FILE 读取当前档案；详情中可阅读摘要与研究记录、收藏、导出文本。
- / 打开检索；Esc 关闭弹窗或返回阵列。
- 详情页可进入 360° 查看器：拖动旋转、滚轮缩放、拆解与重组模型。
- 收藏、音效、画质、明暗配色等偏好保存在当前浏览器。

## 部署

`npm run build` 输出 `dist/`（含 PWA 离线缓存），交给任意静态托管即可：Nginx、Caddy、
Cloudflare Pages、Vercel、GitHub Pages 均可。注意通过服务地址访问，不要直接双击 `dist/index.html`。

## 许可与归属

- 本站界面代码与三维资产基于 [LBEILC/RhineLabUI](https://github.com/LBEILC/RhineLabUI)，
  适用 MIT License（Copyright (c) 2026 LBEILC），见 [LICENSE](LICENSE) 与 [PR15-ATTRIBUTION.md](PR15-ATTRIBUTION.md)。
- 档案内容为观众个人博客的原创数据，按同一 MIT 协议发布。
- 《明日方舟》及莱茵生命相关名称、标志、设定的权利归各自权利人所有，本站为非官方的个人复刻用途；
  MiSans、Novecento 等第三方资源遵循其原有许可，见 `public/licenses/` 与 `public/fonts/NOTICE.txt`。
