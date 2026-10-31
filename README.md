# 观众 · 莱茵档案终端

个人博客「观众 · 作品与博客」的新界面：把博客内容整编成莱茵生命终端风格的三维档案阵列。
界面基于开源项目 [RhineLabUI](https://github.com/LBEILC/RhineLabUI)（TypeScript + Three.js + Vite）搭建，
文章、项目、站点资料与互动数据继承自旧版 Astro 博客。

在线形态：白底开场 → 身份验证 → 循环档案阵列 → 抽取档案、玻璃解密 → 全屏正文阅读、360° 模型查看、收藏与导出。

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

档案内容不是手写进页面的。`data/blog.sqlite`（本地保留，不进 Git）里的 records 表是
站点内容的事实来源，由内置服务与管理后台维护：

```bash
npm start            # 启动服务：站点与 API 在 4321 端口，管理后台在 /admin
npm run admin:create # 首次部署时创建管理员账号
```

- **管理后台**（`/admin`）：档案的增删改查，以及「栏目与规则」——栏目（分类）可自由
  增删、改名、排序（1–9 个），每个栏目可选作品 / 文章 / 资源库 / 通用四种呈现类型；
  访问范围选项与数量上限也可在线调整。删除非空栏目时可把档案一键迁移到其他栏目。
- **档案属性自由扩展**：除固定字段外，每份档案可挂自定义键值对（详情页元信息区展示）；
  文章类档案的 Markdown 正文在详情页全屏阅读。
- **编号永久稳定**：档案编号（X-NNN）一经分配绝不改变——新增取下一个号、删除留空号
  不复用、调整顺序或栏目不改号，因此 TXT 导出文件名与外链地址不会漂移。
- **快照同步**：任何写操作在一个事务内完成「修改 → 校验 → 写快照」，失败整体回滚。
  快照即 `content/archives.json`（完整）、`content/archive-summaries.json`（目录）、
  `content/stats.json`（首页统计）与 `public/records/*.json`、`public/archives/*.txt`
  （单篇资源），`dev` / `build` 前会自动重新校验并导出（`npm run export:archives`）。

校验规则见 `scripts/archive-content.mjs`，内容格式说明见 `content/README.md`；
`npm run check:content` 做全量校验，`node scripts/smoke-columns.mjs` 做数据层
非破坏性冒烟（栏目增删改迁移、编号稳定性，走完自动恢复现场）。

## 操作说明

- 开场按 Enter / Esc 或点击 ENTER SYSTEM 进入阵列。
- ← / → 切换档案列，↑ / ↓ 翻阅同列档案，首尾循环。
- Enter 或 ACCESS FILE 读取当前档案；详情中可阅读摘要与研究记录、收藏、导出文本。
- 文章类档案在详情页打开「正文」页签即进入全屏阅读，Esc 或点击遮罩退出。
- / 打开检索；Esc 关闭弹窗或返回阵列。
- 详情页可进入 360° 查看器：拖动旋转、滚轮缩放、拆解与重组模型。
- 收藏、音效、画质、明暗配色等偏好保存在当前浏览器。

## 部署

`npm run build` 输出 `dist/`（含 PWA 离线缓存），交给任意静态托管即可：Nginx、Caddy、
Cloudflare Pages、Vercel、GitHub Pages 均可。注意通过服务地址访问，不要直接双击 `dist/index.html`。
若需要管理后台与档案 API，改用 `npm start` 运行内置服务（默认 4321 端口，`PORT` 环境变量可调）。

## 许可与归属

- 本站界面代码与三维资产基于 [LBEILC/RhineLabUI](https://github.com/LBEILC/RhineLabUI)，
  适用 MIT License（Copyright (c) 2026 LBEILC），见 [LICENSE](LICENSE) 与 [PR15-ATTRIBUTION.md](PR15-ATTRIBUTION.md)。
- 档案内容为观众个人博客的原创数据，按同一 MIT 协议发布。
- 《明日方舟》及莱茵生命相关名称、标志、设定的权利归各自权利人所有，本站为非官方的个人复刻用途；
  MiSans、Novecento 等第三方资源遵循其原有许可，见 `public/licenses/` 与 `public/fonts/NOTICE.txt`。
