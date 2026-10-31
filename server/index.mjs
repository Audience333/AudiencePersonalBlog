// 观众档案终端 · 运行时服务
// 零依赖 Node HTTP 服务：托管 dist/ 静态文件，提供档案 API、
// 管理后台接口（档案、栏目、访问范围、上限）与 TXT 导出生成。
// 默认监听 0.0.0.0:4321。
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  listRecords,
  listRecordSummaries,
  getRecord,
  createRecord,
  updateRecord,
  deleteRecord,
  seedIfEmpty,
  getColumns,
  getColumnNames,
  getClearances,
  setClearances,
  getLimits,
  setLimits,
  applyColumns,
} from "./records-db.mjs";
import {
  archiveText,
  MAX_COLUMN_KIND_LENGTH,
  MAX_COLUMNS,
} from "../scripts/archive-content.mjs";
import {
  authenticate,
  createSession,
  destroySession,
  getSessionUser,
  sessionCookie,
  readSessionCookie,
  loginThrottle,
} from "./auth.mjs";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const dist = path.join(root, "dist");
const PORT = Number(process.env.PORT || 4321);
// :: 为双栈监听，localhost 解析到 IPv6(::1) 或 IPv4(127.0.0.1) 都能命中，
// 避免 ::1 被其他进程抢占后浏览器拿到旧服务。
const HOST = process.env.HOST || "::";

seedIfEmpty();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
};

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function send(res, status, body, headers = {}) {
  const isObj = typeof body === "object" && !Buffer.isBuffer(body);
  const data = isObj ? JSON.stringify(body) : body;
  res.writeHead(status, {
    ...securityHeaders,
    ...(isObj ? { "Content-Type": "application/json; charset=utf-8" } : {}),
    ...headers,
  });
  res.end(data);
}

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("请求体过大"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("请求体必须是合法 JSON"));
      }
    });
    req.on("error", reject);
  });
}

function requireAdmin(req, res) {
  const token = readSessionCookie(req.headers.cookie);
  const user = getSessionUser(token);
  if (!user) {
    send(res, 401, { error: "未登录" });
    return undefined;
  }
  if (user.role !== "admin") {
    send(res, 403, { error: "需要管理员权限" });
    return undefined;
  }
  return user;
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // 非浏览器客户端（curl 等）
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

const isText = (v) => typeof v === "string" && v.trim().length > 0;
function validateRecordInput(body) {
  const errors = [];
  const limits = getLimits();
  const columns = getColumnNames();
  const record = {
    category: String(body.category ?? ""),
    title: String(body.title ?? ""),
    en: String(body.en ?? ""),
    department: String(body.department ?? ""),
    date: String(body.date ?? ""),
    lead: String(body.lead ?? ""),
    clearance: String(body.clearance ?? "PUBLIC AREA").trim(),
    abstract: String(body.abstract ?? ""),
    source: String(body.source ?? ""),
  };
  if (!columns.includes(record.category))
    errors.push(`category 必须是现有栏目之一（${columns.join(" / ")}）`);
  for (const key of [
    "title",
    "en",
    "department",
    "date",
    "lead",
    "abstract",
    "source",
  ])
    if (!isText(record[key])) errors.push(`${key} 不能为空`);
  if (!isText(record.clearance)) errors.push("clearance 不能为空");
  else if (record.clearance.length > 50)
    errors.push("clearance 不能超过 50 字");
  const rawBody = String(body.body ?? "").trim();
  if (rawBody.length > limits.bodyMax)
    errors.push(`body 正文不能超过 ${limits.bodyMax} 字`);
  record.body = rawBody;
  const findings = Array.isArray(body.findings)
    ? body.findings.map((f) => String(f).trim()).filter(Boolean)
    : typeof body.findings === "string"
      ? body.findings
          .split("\n")
          .map((f) => f.trim())
          .filter(Boolean)
      : [];
  record.findings = findings;
  const links = Array.isArray(body.links)
    ? body.links
        .map((l) => ({
          label: String(l.label ?? "").trim(),
          url: String(l.url ?? "").trim(),
        }))
        .filter((l) => l.label && l.url)
    : [];
  for (const link of links) {
    const ok = link.url.startsWith("/") || /^https?:\/\//.test(link.url);
    if (!ok) errors.push(`链接 ${link.label} 的 url 不合法`);
  }
  if (
    body.links !== undefined &&
    !Array.isArray(body.links) &&
    typeof body.links !== "string"
  )
    errors.push("links 必须是数组");
  record.links = links;
  // 自定义属性：键值对对象，属性名 30 字以内、值 500 字以内、最多 24 项。
  const extra = {};
  if (body.extra !== undefined) {
    if (
      typeof body.extra !== "object" ||
      body.extra === null ||
      Array.isArray(body.extra)
    ) {
      errors.push("extra 必须是对象（属性名 → 属性值）");
    } else {
      const entries = Object.entries(body.extra);
      if (entries.length > 24) errors.push("自定义属性最多 24 项");
      for (const [key, value] of entries) {
        const name = key.trim();
        const text = String(value ?? "").trim();
        if (!name) continue;
        if (name.length > 30)
          errors.push(`属性名 ${name.slice(0, 12)}… 超过 30 字`);
        else if (text.length > 500)
          errors.push(`属性 ${name} 的值超过 500 字`);
        else extra[name] = text;
      }
    }
  }
  record.extra = extra;
  return { record, errors };
}

// 栏目变更入参校验：名称唯一、类型合法、改名来源真实存在、
// 被删除且有档案的栏目必须提供迁移目标。
function validateColumnsInput(body) {
  const errors = [];
  const previous = getColumnNames();
  const raw = Array.isArray(body.columns) ? body.columns : [];
  if (raw.length < 1 || raw.length > MAX_COLUMNS)
    errors.push(`栏目数量必须在 1 至 ${MAX_COLUMNS} 之间`);
  const columns = raw.map((item) => ({
    name: String(item?.name ?? "").trim(),
    kind: String(item?.kind ?? "generic"),
    previousName: item?.previousName
      ? String(item.previousName).trim()
      : undefined,
  }));
  const names = columns.map((column) => column.name);
  if (names.some((name) => !name)) errors.push("栏目名称不能为空");
  if (names.includes("全部档案")) errors.push("栏目名称不能使用「全部档案」");
  if (new Set(names).size !== names.length) errors.push("栏目名称不能重复");
  for (const column of columns) {
    if (!column.kind || column.kind.length > MAX_COLUMN_KIND_LENGTH)
      errors.push(
        `栏目「${column.name}」的类型需要 1 至 ${MAX_COLUMN_KIND_LENGTH} 个字符（预设 works/article/resource/generic，可自由输入）`,
      );
    if (column.previousName && !previous.includes(column.previousName))
      errors.push(
        `栏目「${column.name}」的改名来源 ${column.previousName} 不存在`,
      );
  }
  const moves = (Array.isArray(body.moves) ? body.moves : []).map((move) => ({
    from: String(move?.from ?? "").trim(),
    to: String(move?.to ?? "").trim(),
  }));
  for (const move of moves) {
    if (!previous.includes(move.from))
      errors.push(`迁移来源 ${move.from} 不是现有栏目`);
    if (!names.includes(move.to))
      errors.push(`迁移目标 ${move.to} 不在新栏目列表中`);
  }
  // 模拟改名与迁移后，仍落在新列表之外的档案必须为空。
  const renamed = new Map(
    columns
      .filter((column) => column.previousName)
      .map((column) => [column.previousName, column.name]),
  );
  const moved = new Map(moves.map((move) => [move.from, move.to]));
  const resolve = (category) =>
    moved.get(category) ?? renamed.get(category) ?? category;
  const orphans = new Map();
  for (const record of listRecords()) {
    if (names.includes(resolve(record.category))) continue;
    orphans.set(record.category, (orphans.get(record.category) ?? 0) + 1);
  }
  for (const [category, count] of orphans)
    errors.push(
      `栏目「${category}」还有 ${count} 份档案，请为它们选择迁移目标`,
    );
  return { columns, moves, errors };
}

function serveStatic(req, res, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return send(res, 400, { error: "bad request" });
  }
  const clean = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  let file = path.join(dist, clean === path.sep ? "" : clean);
  if (!file.startsWith(dist)) return send(res, 403, { error: "forbidden" });
  if (fs.existsSync(file) && fs.statSync(file).isDirectory())
    file = path.join(file, "index.html");
  if (!fs.existsSync(file) && !path.extname(clean)) {
    // 无扩展名的路径回退到对应 HTML（/admin → admin.html，其余 → index.html）
    const named = path.join(dist, `${path.basename(clean)}.html`);
    file = fs.existsSync(named) ? named : path.join(dist, "index.html");
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile())
    return send(res, 404, { error: "not found" });
  const ext = path.extname(file).toLowerCase();
  // Service Worker 必须 no-cache：浏览器每次导航都重新校验，
  // 否则长缓存会让旧 SW 卡死，新部署迟迟不生效。
  const isServiceWorker = path.basename(file) === "sw.js";
  const cache =
    ext === ".html" || isServiceWorker
      ? "no-cache"
      : /\.(js|css|woff2|glb|png|jpg|webp|svg|ico)$/.test(ext)
        ? "public, max-age=31536000, immutable"
        : "public, max-age=3600";
  res.writeHead(200, {
    ...securityHeaders,
    "Content-Type": MIME[ext] ?? "application/octet-stream",
    "Cache-Control": cache,
  });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
  const pathname = url.pathname;
  try {
    // ── 动态 TXT 导出（优先于静态文件）──
    const txtMatch = /^\/archives\/RHINE-LAB-(X-\d{3})\.txt$/.exec(pathname);
    if (txtMatch && req.method === "GET") {
      const record = getRecord(txtMatch[1]);
      if (!record) return send(res, 404, { error: "not found" });
      return send(res, 200, archiveText(record), {
        "Content-Type": "text/plain; charset=utf-8",
      });
    }

    // ── API ──
    const recordMatch = /^\/api\/records(?:\/(X-\d{3}))?$/.exec(pathname);
    if (pathname === "/api/records" && req.method === "GET") {
      const names = getColumnNames();
      return send(res, 200, {
        categories: names,
        columns: names,
        columnMeta: getColumns(),
        records: listRecordSummaries(),
      });
    }
    if (pathname === "/api/meta" && req.method === "GET") {
      return send(res, 200, {
        columns: getColumns(),
        clearances: getClearances(),
        limits: getLimits(),
      });
    }
    if (recordMatch?.[1] && req.method === "GET") {
      const result = getRecord(recordMatch[1]);
      if (!result) return send(res, 404, { error: "not found" });
      const { sort, ...record } = result;
      return send(res, 200, { record });
    }
    if (pathname === "/api/login" && req.method === "POST") {
      if (!sameOrigin(req)) return send(res, 403, { error: "非法来源" });
      const body = await readBody(req);
      const username = String(body.username ?? "").trim();
      const password = String(body.password ?? "").trim();
      if (!loginThrottle(username))
        return send(res, 429, { error: "尝试次数过多，请 15 分钟后再试" });
      const user = await authenticate(username, password);
      if (!user) return send(res, 401, { error: "用户名或密码不正确" });
      const token = createSession(user.id);
      return send(
        res,
        200,
        { ok: true, username: user.username },
        {
          "Set-Cookie": sessionCookie(token),
        },
      );
    }
    if (pathname === "/api/logout" && req.method === "POST") {
      destroySession(readSessionCookie(req.headers.cookie));
      return send(
        res,
        200,
        { ok: true },
        {
          "Set-Cookie": sessionCookie("", { clear: true }),
        },
      );
    }
    if (pathname === "/api/me" && req.method === "GET") {
      const user = getSessionUser(readSessionCookie(req.headers.cookie));
      return send(res, 200, user ?? null);
    }

    // ── 站点结构设置（管理员）──
    if (pathname === "/api/columns" && req.method === "PUT") {
      if (!sameOrigin(req)) return send(res, 403, { error: "非法来源" });
      if (!requireAdmin(req, res)) return;
      const body = await readBody(req);
      const { columns, moves, errors } = validateColumnsInput(body);
      if (errors.length) return send(res, 400, { error: errors.join("；") });
      try {
        return send(res, 200, { columns: applyColumns(columns, moves) });
      } catch (error) {
        // 新增的栏目暂时为空、被「每列最少」拦截时，自动放开空栏目限制
        // 并重试一次，让「新增栏目」永远可以直接保存。
        const addedNew = columns.some(
          (column) =>
            !getColumnNames().includes(column.previousName ?? column.name),
        );
        if (addedNew && /每列 \d+ 至 \d+ 份档案，实际 0/.test(error.message)) {
          try {
            setLimits({ minPerColumn: 0 });
            return send(res, 200, {
              columns: applyColumns(columns, moves),
              note: "已自动允许空栏目（每列最少调整为 0，可在上限面板改回）",
            });
          } catch (retryError) {
            return send(res, 400, { error: retryError.message });
          }
        }
        return send(res, 400, { error: error.message });
      }
    }
    if (pathname === "/api/clearances" && req.method === "PUT") {
      if (!sameOrigin(req)) return send(res, 403, { error: "非法来源" });
      if (!requireAdmin(req, res)) return;
      const body = await readBody(req);
      const raw = Array.isArray(body.clearances) ? body.clearances : [];
      const clearances = [
        ...new Set(raw.map((v) => String(v).trim())),
      ].filter(Boolean);
      if (!clearances.length || clearances.length > 24)
        return send(res, 400, { error: "访问范围选项需要 1 至 24 项" });
      if (clearances.some((v) => v.length > 30))
        return send(res, 400, { error: "访问范围选项每项不超过 30 字" });
      return send(res, 200, { clearances: setClearances(clearances) });
    }
    if (pathname === "/api/limits" && req.method === "PUT") {
      if (!sameOrigin(req)) return send(res, 403, { error: "非法来源" });
      if (!requireAdmin(req, res)) return;
      const body = await readBody(req);
      try {
        return send(res, 200, { limits: setLimits(body) });
      } catch (error) {
        return send(res, 400, { error: error.message });
      }
    }

    if (recordMatch) {
      if (!sameOrigin(req)) return send(res, 403, { error: "非法来源" });
      if (req.method === "POST" && !recordMatch[1]) {
        if (!requireAdmin(req, res)) return;
        const body = await readBody(req);
        const { record, errors } = validateRecordInput(body);
        if (errors.length) return send(res, 400, { error: errors.join("；") });
        const limits = getLimits();
        const columnCount = listRecords().filter(
          (r) => r.category === record.category,
        ).length;
        if (columnCount >= limits.maxPerColumn)
          return send(res, 400, {
            error: `该栏目已满（每列最多 ${limits.maxPerColumn} 份，可在「栏目与规则」调整）`,
          });
        try {
          return send(res, 201, { record: createRecord(record) });
        } catch (error) {
          return send(res, 400, { error: error.message });
        }
      }
      if (req.method === "PUT" && recordMatch[1]) {
        if (!requireAdmin(req, res)) return;
        const body = await readBody(req);
        const { record, errors } = validateRecordInput(body);
        if (errors.length) return send(res, 400, { error: errors.join("；") });
        let updated;
        try {
          updated = updateRecord(recordMatch[1], record);
        } catch (error) {
          return send(res, 400, { error: error.message });
        }
        if (!updated) return send(res, 404, { error: "档案不存在" });
        return send(res, 200, { record: updated });
      }
      if (req.method === "DELETE" && recordMatch[1]) {
        if (!requireAdmin(req, res)) return;
        const limits = getLimits();
        const minTotal = Math.max(
          1,
          limits.minPerColumn * getColumnNames().length,
        );
        if (listRecords().length <= minTotal)
          return send(res, 400, { error: `档案总数不能少于 ${minTotal} 份` });
        try {
          if (!deleteRecord(recordMatch[1]))
            return send(res, 404, { error: "档案不存在" });
        } catch (error) {
          return send(res, 400, { error: error.message });
        }
        return send(res, 200, { ok: true });
      }
    }

    if (pathname.startsWith("/api/"))
      return send(res, 404, { error: "not found" });

    // ── 静态文件 ──
    if (req.method !== "GET" && req.method !== "HEAD")
      return send(res, 405, { error: "method not allowed" });
    if (!fs.existsSync(dist))
      return send(res, 503, { error: "dist/ 不存在，请先执行 npm run build" });
    return serveStatic(req, res, pathname);
  } catch (error) {
    console.error(error);
    return send(res, 500, { error: "服务器内部错误" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`莱茵档案终端服务已启动: http://${HOST}:${PORT}/`);
  console.log(`管理后台: http://localhost:${PORT}/admin`);
});
