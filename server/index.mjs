// 观众档案终端 · 运行时服务
// 零依赖 Node HTTP 服务：托管 dist/ 静态文件，提供档案 API、
// 管理后台接口与 TXT 导出生成。默认监听 0.0.0.0:4321。
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  listRecords,
  getRecord,
  createRecord,
  updateRecord,
  deleteRecord,
  seedIfEmpty,
} from "./records-db.mjs";
import { archiveText } from "../scripts/archive-content.mjs";
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
const COLUMNS = ["作品", "文章", "资源库"];

seedIfEmpty();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
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
  const record = {
    category: String(body.category ?? ""),
    title: String(body.title ?? ""),
    en: String(body.en ?? ""),
    department: String(body.department ?? ""),
    date: String(body.date ?? ""),
    lead: String(body.lead ?? ""),
    clearance: String(body.clearance ?? "PUBLIC AREA"),
    abstract: String(body.abstract ?? ""),
    source: String(body.source ?? ""),
  };
  if (!COLUMNS.includes(record.category)) errors.push("category 必须是 作品/文章/资源库");
  for (const key of ["title", "en", "department", "date", "lead", "abstract", "source"])
    if (!isText(record[key])) errors.push(`${key} 不能为空`);
  const rawBody = String(body.body ?? "").trim();
  if (rawBody.length > 20000) errors.push("body 正文不能超过 20000 字");
  record.body = rawBody;
  const findings = Array.isArray(body.findings)
    ? body.findings.map((f) => String(f).trim()).filter(Boolean)
    : typeof body.findings === "string"
      ? body.findings.split("\n").map((f) => f.trim()).filter(Boolean)
      : [];
  if (!findings.length) errors.push("findings 至少一条");
  const links = Array.isArray(body.links)
    ? body.links
        .map((l) => ({ label: String(l.label ?? "").trim(), url: String(l.url ?? "").trim() }))
        .filter((l) => l.label && l.url)
    : [];
  for (const link of links) {
    const ok = link.url.startsWith("/") || /^https?:\/\//.test(link.url);
    if (!ok) errors.push(`链接 ${link.label} 的 url 不合法`);
  }
  if (body.links !== undefined && !Array.isArray(body.links) && typeof body.links !== "string")
    errors.push("links 必须是数组");
  record.findings = findings;
  record.links = links;
  return { record, errors };
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
  const cache =
    ext === ".html"
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
    if (pathname === "/api/records" && req.method === "GET") {
      return send(res, 200, {
        categories: COLUMNS,
        columns: COLUMNS,
        records: listRecords(),
      });
    }
    if (pathname === "/api/login" && req.method === "POST") {
      if (!sameOrigin(req)) return send(res, 403, { error: "非法来源" });
      const body = await readBody(req);
      const username = String(body.username ?? "").trim();
      const password = String(body.password ?? "").trim();
      if (!loginThrottle(username))
        return send(res, 429, { error: "尝试次数过多，请 15 分钟后再试" });
      const user = await authenticate(username, password);
      if (!user)
        return send(res, 401, { error: "用户名或密码不正确" });
      const token = createSession(user.id);
      return send(res, 200, { ok: true, username: user.username }, {
        "Set-Cookie": sessionCookie(token),
      });
    }
    if (pathname === "/api/logout" && req.method === "POST") {
      destroySession(readSessionCookie(req.headers.cookie));
      return send(res, 200, { ok: true }, {
        "Set-Cookie": sessionCookie("", { clear: true }),
      });
    }
    if (pathname === "/api/me" && req.method === "GET") {
      const user = getSessionUser(readSessionCookie(req.headers.cookie));
      return send(res, 200, user ?? null);
    }

    const recordMatch = /^\/api\/records(?:\/(X-\d{3}))?$/.exec(pathname);
    if (recordMatch) {
      if (!sameOrigin(req)) return send(res, 403, { error: "非法来源" });
      if (req.method === "POST" && !recordMatch[1]) {
        if (!requireAdmin(req, res)) return;
        const body = await readBody(req);
        const { record, errors } = validateRecordInput(body);
        if (errors.length) return send(res, 400, { error: errors.join("；") });
        const columnCount = listRecords().filter((r) => r.category === record.category).length;
        if (columnCount >= 12) return send(res, 400, { error: "该列已满（每列最多 12 份）" });
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
        if (listRecords().length <= 9)
          return send(res, 400, { error: "档案总数不能少于 9 份" });
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
