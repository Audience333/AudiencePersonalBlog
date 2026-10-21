// 继承个人博客数据：读取本地 data/blog.sqlite（旧 Astro 博客的数据库）与
// content/site.json（站点资料），生成莱茵终端使用的 content/archives.json。
// 档案布局固定为五类、每类八份；编号 X-001 至 X-040 按数组顺序稳定生成。
// 首篇文章与首个项目作为旗舰档案整编，留言簿、阅读数等动态数据注入对应档案。
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const root = new URL("..", import.meta.url);
const read = (path) => fs.readFile(new URL(path, root), "utf8");
const site = JSON.parse(await read("content/site.json"));

const db = new Database(fileURLToPath(new URL("data/blog.sqlite", root)), {
  readonly: true,
});
const post = db
  .prepare(
    `SELECT slug, title, description, body_markdown, tags_json, published_at, view_count
     FROM posts WHERE status = 'published' AND archived = 0
     ORDER BY published_at ASC, id ASC LIMIT 1`,
  )
  .get();
const project = db
  .prepare(
    `SELECT slug, title, description, body_markdown, tools_json, year
     FROM projects WHERE status = 'published'
     ORDER BY year ASC, id ASC LIMIT 1`,
  )
  .get();
const guestbook = db
  .prepare(
    `SELECT nickname, body, status, created_at FROM guestbook
     ORDER BY id DESC LIMIT 1`,
  )
  .get();
const pageViews = db.prepare(`SELECT COUNT(*) AS n FROM page_views`).get().n;
const postStats = db
  .prepare(
    `SELECT COUNT(*) AS posts, COALESCE(SUM(view_count), 0) AS views
     FROM posts WHERE status = 'published' AND archived = 0`,
  )
  .get();
const commentCount = db.prepare(`SELECT COUNT(*) AS n FROM comments`).get().n;
const postTags = post ? JSON.parse(post.tags_json) : [];
db.close();

if (!post) throw new Error("data/blog.sqlite 中没有已发布文章，无法生成档案。");
if (!project) throw new Error("data/blog.sqlite 中没有已发布项目，无法生成档案。");

const GITHUB = site.links.find((l) => l.label === "GitHub")?.url
  ?? "https://github.com/Audience333";

const clean = (text) =>
  text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1（$2）")
    .replace(/~~(.+?)~~/g, "$1")
    .trim();

// 把 Markdown 正文整理为纯文本研究记录：标题与列表逐项成条，段落合并。
function mdToFindings(md) {
  const findings = [];
  let para = [];
  const flush = () => {
    if (para.length) {
      const text = clean(para.join(" "));
      if (text) findings.push(text);
      para = [];
    }
  };
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const match =
      line.match(/^[-*+]\s+(.*)$/) ??
      line.match(/^\d+[.、)]\s*(.*)$/) ??
      line.match(/^#{1,6}\s+(.*)$/);
    if (match) { flush(); const text = clean(match[1]); if (text) findings.push(text); }
    else para.push(line);
  }
  flush();
  return findings;
}

const clip = (text, max) =>
  text.length > max ? `${text.slice(0, max)}……` : text;

// 旧版留言接口曾把个别留言以替换字符写入数据库，内容已不可恢复；
// 检出后回退为可读文本，避免把乱码带进档案。
const intact = (text) => typeof text === "string" && text.trim() && !text.includes("�");
const guestName = intact(guestbook?.nickname) ? guestbook.nickname.trim() : "匿名用户";
const guestBody = intact(guestbook?.body)
  ? clip(clean(guestbook.body).replace(/\s+/g, " "), 160)
  : "原留言内容在旧版数据库中已损坏，无法恢复，仅保留收到记录。";

const fmtDay = (ms) => {
  const d = new Date(ms + 8 * 3600_000); // Asia/Shanghai
  return d.toISOString().slice(0, 10);
};

const categories = ["文章档案", "项目工程", "站点备忘", "关于观众", "互动记录"];
// 阵列列序与档案分组不同：首篇文章固定为 X-001，落在左起第二列，
// 与原项目“编号顺序 ≠ 列顺序”的约定一致（检索另有校验依赖这一点）。
const columns = ["项目工程", "文章档案", "站点备忘", "关于观众", "互动记录"];
const AUTHOR = site.author;
const GUEST_DATE = guestbook ? fmtDay(guestbook.created_at) : "建站资料汇编";

const record = (fields) => fields;
const records = [
  // ── 文章档案 ────────────────────────────────────────────────
  record({
    id: "X-001", category: "文章档案",
    title: post.title, en: "THE FIRST POST",
    department: "编辑部", date: post.published_at, lead: AUTHOR,
    clearance: "PUBLIC AREA",
    abstract: post.description,
    findings: mdToFindings(post.body_markdown),
    source: GITHUB,
  }),
  record({
    id: "X-002", category: "文章档案",
    title: "写作方向：学习经历", en: "LEARNING NOTES",
    department: "编辑部", date: "写作计划", lead: AUTHOR,
    clearance: "PUBLIC AREA",
    abstract:
      "博客的第一批写作方向之一：从一次具体的学习经历写起。计划出自首篇文章《网站从这里开始》的“接下来写什么”。",
    findings: [
      "记录一个真实的学习过程，而不是泛泛的感想。",
      "写清楚卡住的点，以及最后是怎么解决的。",
      "篇幅长的学习记录允许拆成多篇，用系列归档连起来。",
    ],
    source: GITHUB,
  }),
  record({
    id: "X-003", category: "文章档案",
    title: "写作方向：小项目", en: "PET PROJECTS",
    department: "编辑部", date: "写作计划", lead: AUTHOR,
    clearance: "PUBLIC AREA",
    abstract:
      "博客的第一批写作方向之一：从做过的一个小项目开始写。计划出自首篇文章《网站从这里开始》的“接下来写什么”。",
    findings: [
      "写清楚做了什么、为什么做、做到什么程度。",
      "配上真实截图和踩坑记录，比只写结论更有用。",
      "项目结束后可以回写一篇总结，补上当时没看到的部分。",
    ],
    source: GITHUB,
  }),
  record({
    id: "X-004", category: "文章档案",
    title: "写作方向：有趣文章", en: "READING LOG",
    department: "编辑部", date: "写作计划", lead: AUTHOR,
    clearance: "PUBLIC AREA",
    abstract:
      "博客的第一批写作方向之一：记录最近读到的有趣文章。计划出自首篇文章《网站从这里开始》的“接下来写什么”。",
    findings: [
      "摘录原文链接，并用一句话说明为什么值得读。",
      "写下自己认同的部分，也保留存疑的部分。",
      "隔一段时间可以回看，检验想法有没有变化。",
    ],
    source: GITHUB,
  }),
  record({
    id: "X-005", category: "文章档案",
    title: `话题：${postTags[0] ?? "网站建设"}`, en: "TOPIC: SITE BUILDING",
    department: "编辑部", date: "首篇文章标签", lead: AUTHOR,
    clearance: "PUBLIC AREA",
    abstract:
      `“${postTags[0] ?? "网站建设"}”是首篇文章使用的标签之一。旧版博客按标签聚合文章，本站继承这一话题作为独立档案。`,
    findings: [
      "当前这座终端本身就是这一话题的实例。",
      "同标签的文章在旧版站点通过 /blog/tags/ 页面聚合。",
      "之后发布的同主题文章继续归入此话题。",
    ],
    source: GITHUB,
  }),
  record({
    id: "X-006", category: "文章档案",
    title: `话题：${postTags[1] ?? "随笔"}`, en: "TOPIC: ESSAYS",
    department: "编辑部", date: "首篇文章标签", lead: AUTHOR,
    clearance: "PUBLIC AREA",
    abstract:
      `“${postTags[1] ?? "随笔"}”是首篇文章使用的标签之一，用来存放不设主题的日常记录。`,
    findings: [
      "随笔没有固定格式，长短都可以。",
      "写给自己看的记录，也值得留下来。",
      "与“网站建设”话题互补：一个记录过程，一个记录想法。",
    ],
    source: GITHUB,
  }),
  record({
    id: "X-007", category: "文章档案",
    title: "发布约定", en: "PUBLISHING RULES",
    department: "编辑部", date: "旧版站点规则", lead: AUTHOR,
    clearance: "INTERNAL AREA",
    abstract:
      "旧版博客的文章发布规则。文章由后台写入 SQLite，站点时区固定为 Asia/Shanghai。",
    findings: [
      "文章有草稿与已发布两种状态，支持定时发布。",
      "系列文章按 series 与 series_order 字段排序。",
      "列表页每页默认 10 篇，可按最新、最热、字数排序。",
    ],
    source: GITHUB,
  }),
  record({
    id: "X-008", category: "文章档案",
    title: "阅读体验", en: "READING EXPERIENCE",
    department: "编辑部", date: "旧版站点功能", lead: AUTHOR,
    clearance: "INTERNAL AREA",
    abstract:
      "旧版博客为长文准备的阅读辅助：阅读时长估算、目录、相关文章与订阅。",
    findings: [
      "阅读时长按中文约 500 字/分钟、西文约 220 词/分钟估算。",
      "标题达到两个以上时生成目录，支持 h2 与 h3。",
      "文章底部有上一篇/下一篇与按标签匹配的相关文章。",
      "全站提供 RSS 订阅与 sitemap。",
    ],
    source: GITHUB,
  }),

  // ── 项目工程 ────────────────────────────────────────────────
  record({
    id: "X-009", category: "项目工程",
    title: project.title, en: "PERSONAL WEBSITE",
    department: "工程科", date: String(project.year), lead: AUTHOR,
    clearance: "PUBLIC AREA",
    abstract: project.description,
    findings: mdToFindings(project.body_markdown),
    source: GITHUB,
  }),
  record({
    id: "X-010", category: "项目工程",
    title: "Astro 框架", en: "ASTRO",
    department: "工程科", date: "技术选型", lead: "Audience",
    clearance: "REFERENCE AREA",
    abstract:
      "旧版博客基于 Astro 7 构建：服务端渲染、按路由组织页面、内容与模板分离。",
    findings: [
      "使用 @astrojs/node 独立适配器输出 Node 服务。",
      "文章在请求时从 SQLite 读取，不经过静态生成。",
      "空内容集合保留在 src/content，仅作为 Astro 配置占位。",
    ],
    source: "https://astro.build",
  }),
  record({
    id: "X-011", category: "项目工程",
    title: "SQLite 数据库", en: "SQLITE",
    department: "工程科", date: "技术选型", lead: "Audience",
    clearance: "REFERENCE AREA",
    abstract:
      "全部博客数据保存在单个 data/blog.sqlite 文件中，开启 WAL 模式兼顾读写并发。",
    findings: [
      "使用 better-sqlite3 同步驱动，在页面渲染时直接查询。",
      "共 19 张表，覆盖文章、项目、评论、留言、弹幕、点赞与统计。",
      "FTS5 三元组索引覆盖标题、描述、正文与标签，支撑全文搜索。",
    ],
    source: "https://www.sqlite.org",
  }),
  record({
    id: "X-012", category: "项目工程",
    title: "Markdown 渲染", en: "MARKDOWN PIPELINE",
    department: "工程科", date: "技术选型", lead: "Audience",
    clearance: "REFERENCE AREA",
    abstract:
      "正文以 Markdown 存储，渲染管线负责公式、图表与安全过滤。",
    findings: [
      "marked 以 GFM 模式解析正文。",
      "$ 与 $$ 公式交给 KaTeX，```mermaid 代码块渲染为图表。",
      "sanitize-html 白名单过滤，输出安全 HTML。",
    ],
    source: "https://marked.js.org",
  }),
  record({
    id: "X-013", category: "项目工程",
    title: "样式与组件", en: "STYLES & COMPONENTS",
    department: "工程科", date: "技术选型", lead: "Audience",
    clearance: "REFERENCE AREA",
    abstract:
      "旧版博客使用手写 CSS 与 Astro 组件组织界面，无前端框架。",
    findings: [
      "布局、排版与配色集中在 src/styles 管理。",
      "目录、相关文章、分页等以组件形式复用。",
      "代码块带复制按钮，长文带阅读进度条。",
    ],
    source: "https://astro.build",
  }),
  record({
    id: "X-014", category: "项目工程",
    title: "Node 运行时", en: "NODE RUNTIME",
    department: "工程科", date: "技术选型", lead: "Audience",
    clearance: "REFERENCE AREA",
    abstract:
      "生产环境以 Node 服务运行旧版博客，要求 Node.js 24.15 或更高版本。",
    findings: [
      "@astrojs/node 独立模式输出可启动的服务端入口。",
      "登录会话通过 cookie 与服务器端 sessions 表维持。",
      "start.mjs 脚本用于生产启动。",
    ],
    source: "https://nodejs.org",
  }),
  record({
    id: "X-015", category: "项目工程",
    title: "测试", en: "TESTS",
    department: "工程科", date: "工程质量", lead: "Audience",
    clearance: "INTERNAL AREA",
    abstract:
      "旧版博客带有单元与集成测试，覆盖数据迁移、文章操作、阅读统计与 SEO。",
    findings: [
      "node --test 运行 migrations、operations、posts、reading、seo、time 等用例。",
      "tests/integration.mjs 做端到端接口验证。",
      "astro check 负责 TypeScript 与模板类型检查。",
    ],
    source: "https://nodejs.org",
  }),
  record({
    id: "X-016", category: "项目工程",
    title: "静态资源优化", en: "ASSET PIPELINE",
    department: "工程科", date: "工程质量", lead: "Audience",
    clearance: "INTERNAL AREA",
    abstract:
      "旧版博客用 sharp 处理图片资源，并提供一键优化脚本。",
    findings: [
      "optimize-assets.mjs 压缩并生成 WebP 版本。",
      "站点头图 archive-hero 同时保留 PNG 与 WebP。",
      "头像与图标集中在 public 目录分发。",
    ],
    source: "https://sharp.pixelplumbing.com",
  }),

  // ── 站点备忘 ────────────────────────────────────────────────
  record({
    id: "X-017", category: "站点备忘",
    title: "站点宗旨", en: "SITE MISSION",
    department: "站务科", date: "长期有效", lead: AUTHOR,
    clearance: "INTERNAL AREA",
    abstract: `${site.name}——${site.description}`,
    findings: [
      `站点标语：“${site.motto}”`,
      "把作品和文章放在同一个地方，持续记录做过的事与学到的知识。",
      "先跑起来，再慢慢补齐；内容比形式重要。",
    ],
    source: GITHUB,
  }),
  record({
    id: "X-018", category: "站点备忘",
    title: "站点地图", en: "SITE MAP",
    department: "站务科", date: "旧版路由", lead: AUTHOR,
    clearance: "INTERNAL AREA",
    abstract:
      "旧版博客的主要页面。本站替换为莱茵终端后，这些内容以档案形式继续保存。",
    findings: [
      "/blog 文章列表，支持排序与关键词搜索。",
      "/blog/tags/ 与 /blog/series 按标签、系列浏览文章。",
      "/projects 展示项目作品。",
      "/guestbook 留言板，RSS 与 sitemap 提供订阅入口。",
    ],
    source: GITHUB,
  }),
  record({
    id: "X-019", category: "站点备忘",
    title: "检索系统", en: "FULL-TEXT SEARCH",
    department: "站务科", date: "旧版功能", lead: AUTHOR,
    clearance: "INTERNAL AREA",
    abstract:
      "旧版博客在服务端实现全文检索；本站改用终端内置的档案检索（按 / 键打开）。",
    findings: [
      "FTS5 三元组索引覆盖标题、描述、正文与标签。",
      "索引不可用时自动退回 LIKE 模糊匹配。",
      "新终端支持按编号、标题、科室与分类筛选档案。",
    ],
    source: "https://www.sqlite.org",
  }),
  record({
    id: "X-020", category: "站点备忘",
    title: "音乐播放器", en: "MUSIC PLAYER",
    department: "站务科", date: "旧版功能", lead: AUTHOR,
    clearance: "INTERNAL AREA",
    abstract:
      "旧版博客内置音乐播放器，曲目来自 music/ 目录的扫描结果，不经过数据库。",
    findings: [
      "当前曲库保留测试音轨《01-测试音调》与说明文件。",
      "曲目通过 /api/music 接口按文件名点播。",
      "新终端保留三轨循环配乐作为站点声音。",
    ],
    source: GITHUB,
  }),
  record({
    id: "X-021", category: "站点备忘",
    title: "留言板", en: "GUESTBOOK",
    department: "站务科", date: "旧版功能", lead: AUTHOR,
    clearance: "INTERNAL AREA",
    abstract:
      "旧版博客的公开留言板：匿名也可以留言，所有留言经审核后展示。",
    findings: [
      "未留昵称时显示为“匿名用户”。",
      "留言状态分待审核、已通过、已拒绝三种。",
      "新终端不再接收留言，历史留言见互动记录档案。",
    ],
    source: GITHUB,
  }),
  record({
    id: "X-022", category: "站点备忘",
    title: "弹幕系统", en: "DANMAKU",
    department: "站务科", date: "旧版功能", lead: AUTHOR,
    clearance: "INTERNAL AREA",
    abstract:
      "旧版博客在阅读页提供弹幕：评论以浮动文字飘过正文区域。",
    findings: [
      "弹幕与文章关联，经审核后飘过阅读页。",
      "弹幕和评论使用不同的表，互不影响。",
      "迁移到终端界面后，弹幕功能随之退役。",
    ],
    source: GITHUB,
  }),
  record({
    id: "X-023", category: "站点备忘",
    title: "部署与运维", en: "DEPLOYMENT",
    department: "站务科", date: "运维记录", lead: AUTHOR,
    clearance: "RESTRICTED",
    abstract:
      "旧版博客的服务端部署方式：systemd 托管、Caddy 反代、脚本备份。",
    findings: [
      "personal-blog.service 以 systemd 常驻运行 Node 服务。",
      "Caddyfile 提供反向代理与自动 HTTPS。",
      "backup.mjs 定期备份 SQLite 数据库。",
    ],
    source: GITHUB,
  }),
  record({
    id: "X-024", category: "站点备忘",
    title: "数据与备份", en: "DATA & BACKUP",
    department: "站务科", date: "运维记录", lead: AUTHOR,
    clearance: "RESTRICTED",
    abstract:
      "博客数据的存放约定：单一 SQLite 文件 + 本地音乐目录，全部可以整体搬走。",
    findings: [
      "data/blog.sqlite 是唯一的持久化数据文件，开启 WAL。",
      "music/ 目录保存音乐文件，随仓库一起备份。",
      "本文档涉及的旧版脚本与配置已归档至 git 历史。",
    ],
    source: "https://www.sqlite.org",
  }),

  // ── 关于观众 ────────────────────────────────────────────────
  record({
    id: "X-025", category: "关于观众",
    title: site.author, en: site.authorEn,
    department: "人事档案科", date: "长期有效", lead: AUTHOR,
    clearance: "PRIVATE AREA",
    abstract:
      `站长内部档案：网名“${site.author}”，英文署名 ${site.authorEn}。${site.profile.bio}`,
    findings: [
      `本档案编号沿用终端身份验证名 ${site.authorEn}。`,
      "本站唯一作者与管理员。",
      "写作、做项目、公开学习是长期主线。",
    ],
    source: GITHUB,
  }),
  record({
    id: "X-026", category: "关于观众",
    title: `来自${site.profile.hometown}`, en: "HOMETOWN",
    department: "人事档案科", date: "长期有效", lead: AUTHOR,
    clearance: "PRIVATE AREA",
    abstract: `出生并成长于${site.profile.hometown}。`,
    findings: [`籍贯：${site.profile.hometown}。`, "离开家乡后仍经常回去。"],
    source: GITHUB,
  }),
  record({
    id: "X-027", category: "关于观众",
    title: `现居${site.profile.location}`, en: "CURRENT CITY",
    department: "人事档案科", date: "长期有效", lead: AUTHOR,
    clearance: "PRIVATE AREA",
    abstract: `目前生活在${site.profile.location}。`,
    findings: [`现居地：${site.profile.location}。`, "在这座城市的学校里继续读书。"],
    source: GITHUB,
  }),
  record({
    id: "X-028", category: "关于观众",
    title: "在读本科生", en: "UNDERGRADUATE",
    department: "人事档案科", date: "学籍状态", lead: AUTHOR,
    clearance: "PRIVATE AREA",
    abstract: `${site.profile.occupation}。`,
    findings: [
      `身份：${site.profile.occupation}。`,
      "课余时间维护本站、写代码和笔记。",
    ],
    source: GITHUB,
  }),
  record({
    id: "X-029", category: "关于观众",
    title: "GitHub 主页", en: "GITHUB PROFILE",
    department: "人事档案科", date: "长期有效", lead: "Audience",
    clearance: "PUBLIC AREA",
    abstract: "代码与开源活动的主页，本站源码也托管在这里。",
    findings: [
      "账号：Audience333。",
      "本站仓库与其迭代历史均可在 GitHub 查看。",
      "欢迎通过 issue 交流建站与编码问题。",
    ],
    source: GITHUB,
  }),
  record({
    id: "X-030", category: "关于观众",
    title: "Bilibili 空间", en: "BILIBILI SPACE",
    department: "人事档案科", date: "长期有效", lead: "Audience",
    clearance: "PUBLIC AREA",
    abstract: "视频站点空间，偶尔分享与学习、项目相关的内容。",
    findings: [
      "空间编号：2058896001。",
      "与 GitHub 互补：一个放视频，一个放代码。",
    ],
    source: "https://space.bilibili.com/2058896001",
  }),
  record({
    id: "X-031", category: "关于观众",
    title: "联系方式", en: "CONTACT",
    department: "人事档案科", date: "长期有效", lead: "Audience",
    clearance: "PRIVATE AREA",
    abstract: "联系站长的渠道，按回复速度从快到慢排列。",
    findings: [
      "邮箱：1742777946@qq.com。",
      "GitHub issue 适合公开的技术讨论。",
      "Bilibili 私信也可以找到人。",
    ],
    source: GITHUB,
  }),
  record({
    id: "X-032", category: "关于观众",
    title: "开往 · 友链接龙", en: "TRAVELLING FRIENDS",
    department: "人事档案科", date: "长期有效", lead: "Audience",
    clearance: "PUBLIC AREA",
    abstract:
      "本站加入的友链接龙：点击后随机前往下一个成员的站点，在网络里随便逛逛。",
    findings: [
      "项目：开往 Travelling to next world。",
      "每次访问都会跳到不同的世界。",
      "期待以后交换更多友链。",
    ],
    source: "https://www.travellings.cn/go.html",
  }),

  // ── 互动记录 ────────────────────────────────────────────────
  record({
    id: "X-033", category: "互动记录",
    title: "留言簿首条留言", en: "FIRST GUESTBOOK ENTRY",
    department: "接待台", date: GUEST_DATE, lead: guestName,
    clearance: "PENDING REVIEW",
    abstract: guestbook
      ? `留言簿目前收到的最新一条留言（${guestbook.status === "pending" ? "待审核" : guestbook.status === "approved" ? "已通过" : "已拒绝"}），原样收录如下。`
      : "留言簿还没有收到留言，虚位以待。",
    findings: guestbook
      ? [
        `${guestName}：${guestBody}`,
        "旧版留言板的审核流程：待审核、已通过、已拒绝。",
        "迁移至终端后留言功能关闭，本条作为历史记录保留。",
      ]
      : ["旧版留言板迁移时没有任何留言。"],
    source: GITHUB,
  }),
  record({
    id: "X-034", category: "互动记录",
    title: "评论机制", en: "COMMENTS",
    department: "接待台", date: "旧版功能", lead: AUTHOR,
    clearance: "REFERENCE AREA",
    abstract:
      "旧版博客的文章评论规则：登录后可评，支持一层回复，先审后发。",
    findings: [
      "评论挂在文章之下，通过 parent_id 支持一层回复。",
      "状态分待审核、已通过、已拒绝。",
      "当前所有文章暂无已通过评论。",
    ],
    source: GITHUB,
  }),
  record({
    id: "X-035", category: "互动记录",
    title: "点赞机制", en: "LIKES",
    department: "接待台", date: "旧版功能", lead: AUTHOR,
    clearance: "REFERENCE AREA",
    abstract:
      "旧版博客的点赞规则：登录用户每篇文章可点赞一次，重复点赞由数据库主键拦截。",
    findings: [
      "likes 表以 post_id + user_id 作为联合主键。",
      "点赞数随文章元数据一起展示。",
      "当前点赞记录为零，等待第一位读者。",
    ],
    source: GITHUB,
  }),
  record({
    id: "X-036", category: "互动记录",
    title: "文章阅读数", en: "POST VIEWS",
    department: "接待台", date: post.published_at, lead: AUTHOR,
    clearance: "REFERENCE AREA",
    abstract:
      `首篇文章《${post.title}》的累计阅读数，数据来自旧版博客数据库。`,
    findings: [
      `当前计数：${post.view_count} 次。`,
      "计数字段随文章保存在 posts.view_count。",
      "每次公开访问累加一次。",
    ],
    source: GITHUB,
  }),
  record({
    id: "X-037", category: "互动记录",
    title: "站点访问日志", en: "PAGE VIEWS",
    department: "接待台", date: "运行统计", lead: AUTHOR,
    clearance: "RESTRICTED",
    abstract:
      "旧版博客记录的站点页面访问日志，仅站长可见。",
    findings: [
      `日志已记录 ${pageViews} 条页面访问。`,
      "每条包含路径、来源、浏览器标识与时间。",
      "数据只用于了解访问情况，不对外展示。",
    ],
    source: GITHUB,
  }),
  record({
    id: "X-038", category: "互动记录",
    title: "收藏与本机偏好", en: "SAVED & PREFERENCES",
    department: "接待台", date: "终端功能", lead: "Audience",
    clearance: "REFERENCE AREA",
    abstract:
      "本终端的收藏与设置保存在当前浏览器中，不随账号同步、不上传到服务器。",
    findings: [
      "SAVE ARCHIVE 收藏当前档案，SAVED 查看收藏列表。",
      "音效、三轨配乐、画质与明暗配色可在设置中调整。",
      "清理浏览器数据会同时清空这些偏好。",
    ],
    source: "https://github.com/LBEILC/RhineLabUI",
  }),
  record({
    id: "X-039", category: "互动记录",
    title: "更新日志", en: "CHANGELOG",
    department: "接待台", date: "虚位以待", lead: AUTHOR,
    clearance: "INTERNAL AREA",
    abstract:
      "站点更新记录。旧版博客预留了 site 与 tech 两类更新，尚未写入任何条目。",
    findings: [
      "当前没有更新记录，等待第一条。",
      "计划记录站点改版与技术升级两类内容。",
    ],
    source: GITHUB,
  }),
  record({
    id: "X-040", category: "互动记录",
    title: "终端操作说明", en: "TERMINAL GUIDE",
    department: "接待台", date: "终端功能", lead: "Audience",
    clearance: "REFERENCE AREA",
    abstract:
      "本终端的操作方式。界面基于开源项目 RhineLabUI（MIT 协议）复刻搭建。",
    findings: [
      "左右方向键切换档案列，上下方向键翻阅同列档案，循环无尽头。",
      "Enter 或 ACCESS FILE 读取当前档案；/ 打开检索，Esc 返回。",
      "详情页可切换 360° 模型查看、拆解结构并导出文本。",
      "收藏与偏好保存在本机浏览器，详见上一条档案。",
    ],
    source: "https://github.com/LBEILC/RhineLabUI",
  }),
];

// ── 结构自检（与 scripts/archive-content.mjs 的校验规则一致）──
if (records.length !== 40) throw new Error(`应有 40 份档案，实际 ${records.length}`);
records.forEach((r, i) => {
  const id = `X-${String(i + 1).padStart(3, "0")}`;
  if (r.id !== id) throw new Error(`第 ${i + 1} 份档案编号应为 ${id}，实际 ${r.id}`);
  if (!categories.includes(r.category)) throw new Error(`${r.id} 分类无效：${r.category}`);
  for (const [key, value] of Object.entries(r)) {
    if (key === "findings") {
      if (!Array.isArray(value) || !value.length || value.some((v) => !v.trim()))
        throw new Error(`${r.id}.findings 必须是非空字符串数组`);
    } else if (typeof value !== "string" || !value.trim()) {
      throw new Error(`${r.id}.${key} 必须是非空文本`);
    }
  }
});
for (const name of categories) {
  const n = records.filter((r) => r.category === name).length;
  if (n !== 8) throw new Error(`分类“${name}”应有 8 份档案，实际 ${n}`);
}

const output = `${JSON.stringify({ categories, columns, records }, null, 2)}\n`;
await fs.writeFile(new URL("content/archives.json", root), output, "utf8");
// 首页个人面板使用的站点统计，与档案共用同一份数据源。
const stats = `${JSON.stringify(
  { posts: postStats.posts, views: postStats.views, comments: commentCount },
  null,
  2,
)}\n`;
await fs.writeFile(new URL("content/stats.json", root), stats, "utf8");
console.log(
  `已从博客数据生成 40 份档案：content/archives.json；站点统计：content/stats.json`,
);
