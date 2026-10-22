// 认证：复用旧博客的 scrypt 密码格式（scrypt$131072$8$1$<salt>$<hash>）
// 与 sessions 表，现有管理员账号可直接登录。
import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { db } from "./records-db.mjs";

const SCRYPT_OPTIONS = { N: 1 << 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
const SESSION_COOKIE = "blog_session";
const SESSION_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const derive = (password, salt) =>
  new Promise((resolve, reject) =>
    scrypt(password, salt, 64, SCRYPT_OPTIONS, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );

export async function hashPassword(password) {
  const salt = randomBytes(24);
  const hash = await derive(password, salt);
  return `scrypt$131072$8$1$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(password, stored) {
  try {
    const parts = String(stored).split("$");
    if (
      parts.length !== 6 ||
      parts[0] !== "scrypt" ||
      parts[1] !== "131072" ||
      parts[2] !== "8" ||
      parts[3] !== "1"
    )
      return false;
    const salt = Buffer.from(parts[4], "hex");
    const expected = Buffer.from(parts[5], "hex");
    if (salt.length !== 24 || expected.length !== 64) return false;
    const actual = await derive(password, salt);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function findUserByName(username) {
  return db
    .prepare(`SELECT * FROM users WHERE username = ? COLLATE NOCASE`)
    .get(username);
}

export async function authenticate(username, password) {
  const user = findUserByName(username);
  // 固定代价的兜底校验，避免用户名枚举。
  const stored = user?.password_hash ?? (await hashPassword("dummy-password"));
  const ok = await verifyPassword(password, stored);
  return ok && user ? user : undefined;
}

export function createSession(userId) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const now = Date.now();
  db.prepare(
    `INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`,
  ).run(tokenHash, userId, now + SESSION_AGE_MS, now);
  return token;
}

export function destroySession(token) {
  if (!token) return;
  db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(
    createHash("sha256").update(token).digest("hex"),
  );
}

export function getSessionUser(token) {
  if (!token || !/^[A-Za-z0-9_-]{40,50}$/.test(token)) return undefined;
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.role FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(createHash("sha256").update(token).digest("hex"), Date.now());
  return row;
}

export function sessionCookie(token, { clear = false } = {}) {
  const parts = [
    `${SESSION_COOKIE}=${clear ? "" : token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (clear) parts.push("Max-Age=0");
  else parts.push(`Max-Age=${Math.floor(SESSION_AGE_MS / 1000)}`);
  return parts.join("; ");
}

export function readSessionCookie(header) {
  const match = /(?:^|;\s*)blog_session=([A-Za-z0-9_-]{40,50})(?:;|$)/.exec(
    header ?? "",
  );
  return match?.[1];
}

// 登录限流：内存计数，每用户名 8 次 / 15 分钟。
const attempts = new Map();
export function loginThrottle(username) {
  const key = String(username).toLowerCase();
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) {
    attempts.set(key, { count: 0, resetAt: now + 15 * 60 * 1000 });
  }
  const current = attempts.get(key);
  current.count += 1;
  return current.count <= 8;
}
