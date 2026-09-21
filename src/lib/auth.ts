import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { AstroCookies } from 'astro';
import { createUser, findUserById, findUserByName, getDb, type Role } from './db.ts';

const COOKIE_NAME = 'blog_session';
const SESSION_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SCRYPT_OPTIONS = { N: 1 << 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };

export interface Viewer {
  id: number;
  username: string;
  role: Role;
}

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, SCRYPT_OPTIONS, (error, key) => error ? reject(error) : resolve(key));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(24);
  const hash = await derive(password, salt);
  return `scrypt$131072$8$1$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt' || parts[1] !== '131072' || parts[2] !== '8' || parts[3] !== '1') return false;
  const salt = Buffer.from(parts[4], 'hex');
  const expected = Buffer.from(parts[5], 'hex');
  if (salt.length !== 24 || expected.length !== 64) return false;
  const actual = await derive(password, salt);
  return timingSafeEqual(actual, expected);
}

export function validUsername(username: string): boolean {
  return /^[\p{L}\p{N}_-]{3,24}$/u.test(username);
}

export function validPassword(password: string): boolean {
  return password.length >= 12 && password.length <= 128;
}

export async function registerReader(username: string, password: string): Promise<Viewer> {
  if (!validUsername(username) || !validPassword(password)) throw new Error('invalid-input');
  if (findUserByName(username)) throw new Error('username-taken');
  const user = createUser(username, await hashPassword(password), 'reader');
  return { id: user.id, username: user.username, role: user.role };
}

export async function authenticate(username: string, password: string): Promise<Viewer | undefined> {
  const user = findUserByName(username);
  // 即使用户名不存在，也执行同等成本的哈希运算，减少账号枚举线索。
  const placeholder = 'scrypt$131072$8$1$000000000000000000000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';
  const valid = await verifyPassword(password, user?.password_hash ?? placeholder);
  return user && valid ? { id: user.id, username: user.username, role: user.role } : undefined;
}

function digest(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createSession(cookies: AstroCookies, viewer: Viewer): void {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  getDb().prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .run(digest(token), viewer.id, now + SESSION_AGE_MS, now);
  cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_AGE_MS / 1000,
  });
}

export function getViewer(cookies: AstroCookies): Viewer | undefined {
  const token = cookies.get(COOKIE_NAME)?.value;
  if (!token || !/^[A-Za-z0-9_-]{40,50}$/.test(token)) return undefined;
  const session = getDb().prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?')
    .get(digest(token)) as { user_id: number; expires_at: number } | undefined;
  if (!session || session.expires_at <= Date.now()) return undefined;
  const user = findUserById(session.user_id);
  return user ? { id: user.id, username: user.username, role: user.role } : undefined;
}

export function destroySession(cookies: AstroCookies): void {
  const token = cookies.get(COOKIE_NAME)?.value;
  if (token) getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(digest(token));
  cookies.delete(COOKIE_NAME, { path: '/' });
}
