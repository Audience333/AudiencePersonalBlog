import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { rebuildPostsFts, runMigrations } from './migrations.ts';

export type Role = 'admin' | 'reader';
export type PostStatus = 'draft' | 'published';
export type ProjectStatus = 'draft' | 'published';
export type CommentStatus = 'pending' | 'approved' | 'rejected';

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: Role;
  avatar: string | null;
  created_at: number;
}

export interface PostRow {
  id: number;
  slug: string;
  title: string;
  description: string;
  body_markdown: string;
  tags_json: string;
  status: PostStatus;
  published_at: string;
  scheduled_at: number | null;
  archived: 0 | 1;
  comments_enabled: 0 | 1;
  cover_image: string | null;
  view_count: number;
  series: string | null;
  series_order: number;
  created_at: number;
  updated_at: number;
}

export interface CommentRow {
  id: number;
  post_id: number;
  user_id: number;
  username: string;
  avatar: string | null;
  parent_id: number | null;
  body: string;
  status: CommentStatus;
  created_at: number;
}

export interface GuestbookRow {
  id: number;
  user_id: number | null;
  nickname: string;
  avatar: string | null;
  body: string;
  status: CommentStatus;
  created_at: number;
}

export interface UpdateRow {
  id: number;
  kind: 'site' | 'tech';
  body: string;
  created_at: number;
}

export interface ResourceRow {
  id: number;
  title: string;
  url: string;
  description: string;
  tags_json: string;
  submitter: string;
  recommended: 0 | 1;
  status: CommentStatus;
  created_at: number;
}

export interface DanmakuRow {
  id: number;
  post_id: number;
  user_id: number;
  username: string;
  body: string;
  status: 'approved' | 'rejected';
  created_at: number;
}

export interface ProjectRow {
  id: number;
  slug: string;
  title: string;
  description: string;
  body_markdown: string;
  tools_json: string;
  year: number;
  featured: number;
  cover_image: string | null;
  status: ProjectStatus;
  created_at: number;
  updated_at: number;
}

let connection: ReturnType<typeof Database> | undefined;

export function openBlogDatabase(path: string): Database.Database {
  const dbPath = resolve(path);
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'reader')),
      avatar TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      body_markdown TEXT NOT NULL,
      tags_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL CHECK(status IN ('draft', 'published')),
      published_at TEXT NOT NULL,
      scheduled_at INTEGER,
      archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1)),
      comments_enabled INTEGER NOT NULL DEFAULT 1 CHECK(comments_enabled IN (0, 1)),
      cover_image TEXT,
      view_count INTEGER NOT NULL DEFAULT 0,
      series TEXT,
      series_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      body_markdown TEXT NOT NULL,
      tools_json TEXT NOT NULL DEFAULT '[]',
      year INTEGER NOT NULL,
      featured INTEGER NOT NULL DEFAULT 0 CHECK(featured IN (0, 1)),
      cover_image TEXT,
      status TEXT NOT NULL CHECK(status IN ('draft', 'published')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      parent_id INTEGER REFERENCES comments(id),
      body TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected')),
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS likes (
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      PRIMARY KEY(post_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY,
      count INTEGER NOT NULL,
      reset_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS page_views (
      id INTEGER PRIMARY KEY,
      path TEXT NOT NULL,
      referrer TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(
      title, description, body, tags, tokenize = 'trigram'
    );
    CREATE TABLE IF NOT EXISTS guestbook (
      id INTEGER PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      nickname TEXT NOT NULL DEFAULT '匿名用户',
      body TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected')),
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS updates (
      id INTEGER PRIMARY KEY,
      kind TEXT NOT NULL DEFAULT 'site' CHECK(kind IN ('site', 'tech')),
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS resources (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      url TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      tags_json TEXT NOT NULL DEFAULT '[]',
      submitter TEXT NOT NULL DEFAULT '',
      recommended INTEGER NOT NULL DEFAULT 0 CHECK(recommended IN (0, 1)),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS danmaku (
      id INTEGER PRIMARY KEY,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      username TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'approved' CHECK(status IN ('approved', 'rejected')),
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_posts_status_date ON posts(status, published_at DESC);
    CREATE INDEX IF NOT EXISTS idx_projects_status_year ON projects(status, featured DESC, year DESC);
    CREATE INDEX IF NOT EXISTS idx_comments_post_status ON comments(post_id, status, created_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  `);
  runMigrations(db);

  const seeded = db.prepare("SELECT value FROM settings WHERE key = 'seeded'").get();
  if (!seeded) {
    const now = Date.now();
    db.prepare(`INSERT INTO posts (slug, title, description, body_markdown, tags_json, status, published_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'welcome', '网站从这里开始', '这是一篇示例文章，展示如何用 Markdown 发布博客内容。',
      '你好，欢迎来到观众的个人网站。\n\n这是一篇**示例文章**。管理员登录后台后，可以直接修改这篇内容。\n\n## 接下来写什么？\n\n可以从一次学习经历、一个小项目，或最近读到的有趣文章开始。',
      JSON.stringify(['网站建设', '随笔']), 'published', '2026-09-17', now, now
    );
    db.prepare("INSERT INTO settings (key, value) VALUES ('seeded', '1')").run();
  }

  const seededProjects = db.prepare("SELECT value FROM settings WHERE key = 'projects_seeded'").get();
  if (!seededProjects) {
    const now = Date.now();
    db.prepare(`INSERT INTO projects (slug, title, description, body_markdown, tools_json, year, featured, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'personal-website', '个人网站', '把作品和文章放在同一个地方，持续记录做过的事与学到的知识。',
      '这是本站的第一个项目：一个同时展示作品与文章的个人网站。\n\n## 目标\n\n- 让来访者快速了解作品与写作主题。\n- 在网页后台编辑 Markdown 内容。\n- 用 SQLite 保存账号、文章、评论与作品。\n\n后续可以在这里补充设计过程、截图、遇到的问题和最终成果。',
      JSON.stringify(['Astro', 'Markdown', 'CSS', 'SQLite']), 2026, 1, 'published', now, now
    );
    db.prepare("INSERT INTO settings (key, value) VALUES ('projects_seeded', '1')").run();
  }
  rebuildPostsFts(db);
  return db;
}

export function getDb() {
  if (connection) return connection;
  const dbPath = resolve(process.env.BLOG_DB_PATH || './data/blog.sqlite');
  connection = openBlogDatabase(dbPath);
  return connection;
}

export function findUserByName(username: string): UserRow | undefined {
  return getDb().prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;
}

export function findUserById(id: number): UserRow | undefined {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

export function createUser(username: string, passwordHash: string, role: Role): UserRow {
  const result = getDb().prepare('INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)')
    .run(username, passwordHash, role, Date.now());
  return findUserById(Number(result.lastInsertRowid))!;
}

export function hasAdmin(): boolean {
  return Boolean(getDb().prepare("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1").get());
}

export function listPublishedPosts(): PostRow[] {
  return getDb().prepare("SELECT * FROM posts WHERE status = 'published' ORDER BY published_at DESC, id DESC").all() as PostRow[];
}

export function listAllPosts(): PostRow[] {
  return getDb().prepare('SELECT * FROM posts ORDER BY updated_at DESC, id DESC').all() as PostRow[];
}

export function findPostBySlug(slug: string): PostRow | undefined {
  return getDb().prepare('SELECT * FROM posts WHERE slug = ?').get(slug) as PostRow | undefined;
}

export function findPostById(id: number): PostRow | undefined {
  return getDb().prepare('SELECT * FROM posts WHERE id = ?').get(id) as PostRow | undefined;
}

type PostWriteInput = Pick<PostRow,
  'slug' | 'title' | 'description' | 'body_markdown' | 'tags_json' | 'status' | 'published_at'
> & Partial<Pick<PostRow, 'scheduled_at' | 'archived' | 'comments_enabled' | 'cover_image' | 'series' | 'series_order'>>;

function syncPostToFts(id: number) {
  const db = getDb();
  db.prepare('DELETE FROM posts_fts WHERE rowid = ?').run(id);
  db.prepare(`INSERT INTO posts_fts(rowid, title, description, body, tags)
    SELECT id, title, description, body_markdown, tags_json FROM posts WHERE id = ?`).run(id);
}

export function savePost(input: PostWriteInput, id?: number): number {
  const now = Date.now();
  const scheduledAt = input.scheduled_at ?? null;
  const archived = input.archived ?? 0;
  const commentsEnabled = input.comments_enabled ?? 1;
  const coverImage = input.cover_image ?? null;
  const series = input.series ?? null;
  const seriesOrder = input.series_order ?? 0;
  if (id) {
    getDb().prepare(`UPDATE posts SET slug = ?, title = ?, description = ?, body_markdown = ?, tags_json = ?,
      status = ?, published_at = ?, scheduled_at = ?, archived = ?, comments_enabled = ?, cover_image = ?,
      series = ?, series_order = ?, updated_at = ?
      WHERE id = ?`)
      .run(input.slug, input.title, input.description, input.body_markdown, input.tags_json, input.status,
        input.published_at, scheduledAt, archived, commentsEnabled, coverImage, series, seriesOrder, now, id);
    syncPostToFts(id);
    return id;
  }
  const result = getDb().prepare(`INSERT INTO posts
    (slug, title, description, body_markdown, tags_json, status, published_at, scheduled_at, archived, comments_enabled, cover_image, series, series_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      input.slug, input.title, input.description, input.body_markdown, input.tags_json, input.status,
      input.published_at, scheduledAt, archived, commentsEnabled, coverImage, series, seriesOrder, now, now,
    );
  const newId = Number(result.lastInsertRowid);
  syncPostToFts(newId);
  return newId;
}

export function incrementPostView(id: number): number {
  const db = getDb();
  db.prepare('UPDATE posts SET view_count = view_count + 1 WHERE id = ?').run(id);
  const row = db.prepare('SELECT view_count FROM posts WHERE id = ?').get(id) as { view_count: number } | undefined;
  return row?.view_count ?? 0;
}

export function listSeriesNames(): string[] {
  return (getDb().prepare(`SELECT DISTINCT series FROM posts WHERE series IS NOT NULL AND series != '' ORDER BY series COLLATE NOCASE`).all() as { series: string }[])
    .map((row) => row.series);
}

export function listPublishedProjects(): ProjectRow[] {
  return getDb().prepare("SELECT * FROM projects WHERE status = 'published' ORDER BY featured DESC, year DESC, id DESC").all() as ProjectRow[];
}

export function listFeaturedProjects(): ProjectRow[] {
  return getDb().prepare("SELECT * FROM projects WHERE status = 'published' AND featured = 1 ORDER BY year DESC, id DESC").all() as ProjectRow[];
}

export function listAllProjects(): ProjectRow[] {
  return getDb().prepare('SELECT * FROM projects ORDER BY updated_at DESC, id DESC').all() as ProjectRow[];
}

export function findProjectBySlug(slug: string): ProjectRow | undefined {
  return getDb().prepare('SELECT * FROM projects WHERE slug = ?').get(slug) as ProjectRow | undefined;
}

export function findProjectById(id: number): ProjectRow | undefined {
  return getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined;
}

export function saveProject(input: Omit<ProjectRow, 'id' | 'created_at' | 'updated_at'>, id?: number): number {
  const now = Date.now();
  if (id) {
    getDb().prepare(`UPDATE projects SET slug = ?, title = ?, description = ?, body_markdown = ?, tools_json = ?, year = ?, featured = ?, cover_image = ?, status = ?, updated_at = ? WHERE id = ?`)
      .run(input.slug, input.title, input.description, input.body_markdown, input.tools_json, input.year, input.featured, input.cover_image, input.status, now, id);
    return id;
  }
  const result = getDb().prepare(`INSERT INTO projects (slug, title, description, body_markdown, tools_json, year, featured, cover_image, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    input.slug, input.title, input.description, input.body_markdown, input.tools_json, input.year, input.featured, input.cover_image, input.status, now, now
  );
  return Number(result.lastInsertRowid);
}

export function listApprovedComments(postId: number): CommentRow[] {
  return getDb().prepare(`SELECT comments.*, users.username, users.avatar FROM comments JOIN users ON users.id = comments.user_id
    WHERE comments.post_id = ? AND comments.status = 'approved' ORDER BY comments.created_at ASC`).all(postId) as CommentRow[];
}

export function listPendingComments(): (CommentRow & { post_title: string })[] {
  return getDb().prepare(`SELECT comments.*, users.username, users.avatar, posts.title AS post_title FROM comments
    JOIN users ON users.id = comments.user_id JOIN posts ON posts.id = comments.post_id
    WHERE comments.status = 'pending' ORDER BY comments.created_at ASC`).all() as (CommentRow & { post_title: string })[];
}

export function addComment(postId: number, userId: number, body: string, status: CommentStatus = 'pending', parentId: number | null = null) {
  getDb().prepare('INSERT INTO comments (post_id, user_id, parent_id, body, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(postId, userId, parentId, body, status, Date.now());
}

export function findCommentById(id: number): CommentRow | undefined {
  return getDb().prepare(`SELECT comments.*, users.username FROM comments JOIN users ON users.id = comments.user_id
    WHERE comments.id = ?`).get(id) as CommentRow | undefined;
}

export function setCommentStatus(id: number, status: CommentStatus) {
  getDb().prepare('UPDATE comments SET status = ? WHERE id = ?').run(status, id);
}

export function countLikes(postId: number): number {
  return (getDb().prepare('SELECT COUNT(*) AS count FROM likes WHERE post_id = ?').get(postId) as { count: number }).count;
}

export function hasLiked(postId: number, userId: number): boolean {
  return Boolean(getDb().prepare('SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?').get(postId, userId));
}

export function toggleLike(postId: number, userId: number) {
  if (hasLiked(postId, userId)) getDb().prepare('DELETE FROM likes WHERE post_id = ? AND user_id = ?').run(postId, userId);
  else getDb().prepare('INSERT INTO likes (post_id, user_id, created_at) VALUES (?, ?, ?)').run(postId, userId, Date.now());
}

export function consumeRateLimit(key: string, maxCount: number, windowMs: number): boolean {
  const db = getDb();
  const now = Date.now();
  const entry = db.prepare('SELECT count, reset_at FROM rate_limits WHERE key = ?').get(key) as { count: number; reset_at: number } | undefined;
  if (!entry || entry.reset_at <= now) {
    db.prepare('INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = 1, reset_at = excluded.reset_at').run(key, now + windowMs);
    return true;
  }
  if (entry.count >= maxCount) return false;
  db.prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?').run(key);
  return true;
}

// ===== 留言墙 =====
export function listApprovedGuestbook(): GuestbookRow[] {
  return getDb().prepare(`SELECT guestbook.*, users.avatar FROM guestbook
    LEFT JOIN users ON users.id = guestbook.user_id
    WHERE guestbook.status = 'approved' ORDER BY guestbook.created_at DESC`).all() as GuestbookRow[];
}

export function listPendingGuestbook(): GuestbookRow[] {
  return getDb().prepare(`SELECT guestbook.*, users.avatar FROM guestbook
    LEFT JOIN users ON users.id = guestbook.user_id
    WHERE guestbook.status = 'pending' ORDER BY guestbook.created_at ASC`).all() as GuestbookRow[];
}

export function addGuestbookEntry(userId: number | null, nickname: string, body: string, status: CommentStatus = 'pending') {
  getDb().prepare('INSERT INTO guestbook (user_id, nickname, body, status, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(userId, nickname, body, status, Date.now());
}

export function setGuestbookStatus(id: number, status: CommentStatus) {
  getDb().prepare('UPDATE guestbook SET status = ? WHERE id = ?').run(status, id);
}

// ===== 动态时间线 =====
export function listUpdates(kind?: 'site' | 'tech'): UpdateRow[] {
  if (kind) return getDb().prepare('SELECT * FROM updates WHERE kind = ? ORDER BY created_at DESC, id DESC').all(kind) as UpdateRow[];
  return getDb().prepare('SELECT * FROM updates ORDER BY created_at DESC, id DESC').all() as UpdateRow[];
}

export function addUpdate(kind: 'site' | 'tech', body: string): void {
  getDb().prepare('INSERT INTO updates (kind, body, created_at) VALUES (?, ?, ?)').run(kind, body, Date.now());
}

export function deleteUpdate(id: number): void {
  getDb().prepare('DELETE FROM updates WHERE id = ?').run(id);
}

// ===== 资源分享 =====
export function listApprovedResources(): ResourceRow[] {
  return getDb().prepare(`SELECT * FROM resources WHERE status = 'approved'
    ORDER BY recommended DESC, created_at DESC, id DESC`).all() as ResourceRow[];
}

export function listPendingResources(): ResourceRow[] {
  return getDb().prepare("SELECT * FROM resources WHERE status = 'pending' ORDER BY created_at ASC").all() as ResourceRow[];
}

export function addResource(input: { title: string; url: string; description: string; tags_json: string; submitter: string }, status: CommentStatus = 'pending') {
  getDb().prepare('INSERT INTO resources (title, url, description, tags_json, submitter, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(input.title, input.url, input.description, input.tags_json, input.submitter, status, Date.now());
}

export function setResourceStatus(id: number, status: CommentStatus) {
  getDb().prepare('UPDATE resources SET status = ? WHERE id = ?').run(status, id);
}

export function setResourceRecommended(id: number, recommended: 0 | 1) {
  getDb().prepare('UPDATE resources SET recommended = ? WHERE id = ?').run(recommended, id);
}

// ===== 弹幕 =====
export function listApprovedDanmaku(postId: number, limit = 50): DanmakuRow[] {
  return getDb().prepare(`SELECT * FROM danmaku WHERE post_id = ? AND status = 'approved'
    ORDER BY created_at DESC, id DESC LIMIT ?`).all(postId, limit) as DanmakuRow[];
}

export function addDanmaku(postId: number, userId: number, username: string, body: string, status: 'approved' | 'rejected' = 'approved') {
  getDb().prepare('INSERT INTO danmaku (post_id, user_id, username, body, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(postId, userId, username, body, status, Date.now());
}

export function listRecentDanmaku(limit = 30): (DanmakuRow & { post_title: string })[] {
  return getDb().prepare(`SELECT danmaku.*, posts.title AS post_title FROM danmaku
    JOIN posts ON posts.id = danmaku.post_id ORDER BY danmaku.created_at DESC LIMIT ?`).all(limit) as (DanmakuRow & { post_title: string })[];
}

export function deleteDanmaku(id: number): void {
  getDb().prepare('DELETE FROM danmaku WHERE id = ?').run(id);
}

// ===== 头像 =====
export function setUserAvatar(userId: number, avatar: string | null): void {
  getDb().prepare('UPDATE users SET avatar = ? WHERE id = ?').run(avatar, userId);
}

// ===== 侧边栏站点统计 =====
export function getPublicStats(): { posts: number; views: number; comments: number } {
  const db = getDb();
  const posts = (db.prepare("SELECT COUNT(*) AS count FROM posts WHERE status = 'published' AND archived = 0").get() as { count: number }).count;
  const views = (db.prepare("SELECT COALESCE(SUM(view_count), 0) AS total FROM posts WHERE status = 'published' AND archived = 0").get() as { total: number }).total;
  const comments = (db.prepare("SELECT COUNT(*) AS count FROM comments WHERE status = 'approved'").get() as { count: number }).count;
  return { posts, views, comments };
}
