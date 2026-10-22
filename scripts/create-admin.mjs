// 创建或重置管理员账号：与旧博客相同的 scrypt 密码格式。
// 用法：npm run admin:create -- <用户名>   （随后输入密码；或直接附加密码参数）
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";
import { hashPassword } from "../server/auth.mjs";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const username = process.argv[2];
const passwordArg = process.argv[3];

if (!username || !/^[一-龥\p{L}\p{N}_-]{3,24}$/u.test(username)) {
  console.error("用法：npm run admin:create -- <用户名> [密码]（用户名 3-24 位字母/数字/汉字/下划线/连字符）");
  process.exit(1);
}
if (passwordArg && (passwordArg.length < 12 || passwordArg.length > 128)) {
  console.error("密码长度需在 12-128 位之间。");
  process.exit(1);
}

let password = passwordArg;
if (!password) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  password = await rl.question("输入密码（12-128 位，输入可见）: ");
  rl.close();
}
if (!password || password.length < 12 || password.length > 128) {
  console.error("密码长度需在 12-128 位之间。");
  process.exit(1);
}

const db = new Database(path.join(root, "data", "blog.sqlite"));
const hash = await hashPassword(password);
const existing = db
  .prepare(`SELECT id FROM users WHERE username = ? COLLATE NOCASE`)
  .get(username);
if (existing) {
  db.prepare(`UPDATE users SET password_hash = ?, role = 'admin' WHERE id = ?`).run(
    hash,
    existing.id,
  );
  console.log(`已重置管理员「${username}」的密码。`);
} else {
  db.prepare(
    `INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, 'admin', ?)`,
  ).run(username, hash, Date.now());
  console.log(`已创建管理员「${username}」。`);
}
db.close();
