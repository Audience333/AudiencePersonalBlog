import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { runMigrations } from './migrations.ts';

export type Role = 'admin' | 'reader';
export type PostStatus = 'draft' | 'published';
export type ProjectStatus = 'draft' | 'published';
export type CommentStatus = 'pending' | 'approved' | 'rejected';

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: Role;
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
  created_at: number;
  updated_at: number;
}

export interface CommentRow {
  id: number;
  post_id: number;
  user_id: number;
  username: string;
  body: string;
  status: CommentStatus;
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
> & Partial<Pick<PostRow, 'scheduled_at' | 'archived' | 'comments_enabled' | 'cover_image'>>;

export function savePost(input: PostWriteInput, id?: number): number {
  const now = Date.now();
  const scheduledAt = input.scheduled_at ?? null;
  const archived = input.archived ?? 0;
  const commentsEnabled = input.comments_enabled ?? 1;
  const coverImage = input.cover_image ?? null;
  if (id) {
    getDb().prepare(`UPDATE posts SET slug = ?, title = ?, description = ?, body_markdown = ?, tags_json = ?,
      status = ?, published_at = ?, scheduled_at = ?, archived = ?, comments_enabled = ?, cover_image = ?, updated_at = ?
      WHERE id = ?`)
      .run(input.slug, input.title, input.description, input.body_markdown, input.tags_json, input.status,
        input.published_at, scheduledAt, archived, commentsEnabled, coverImage, now, id);
    return id;
  }
  const result = getDb().prepare(`INSERT INTO posts
    (slug, title, description, body_markdown, tags_json, status, published_at, scheduled_at, archived, comments_enabled, cover_image, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      input.slug, input.title, input.description, input.body_markdown, input.tags_json, input.status,
      input.published_at, scheduledAt, archived, commentsEnabled, coverImage, now, now,
    );
  return Number(result.lastInsertRowid);
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
  return getDb().prepare(`SELECT comments.*, users.username FROM comments JOIN users ON users.id = comments.user_id
    WHERE comments.post_id = ? AND comments.status = 'approved' ORDER BY comments.created_at ASC`).all(postId) as CommentRow[];
}

export function listPendingComments(): (CommentRow & { post_title: string })[] {
  return getDb().prepare(`SELECT comments.*, users.username, posts.title AS post_title FROM comments
    JOIN users ON users.id = comments.user_id JOIN posts ON posts.id = comments.post_id
    WHERE comments.status = 'pending' ORDER BY comments.created_at ASC`).all() as (CommentRow & { post_title: string })[];
}

export function addComment(postId: number, userId: number, body: string) {
  getDb().prepare("INSERT INTO comments (post_id, user_id, body, status, created_at) VALUES (?, ?, ?, 'pending', ?)")
    .run(postId, userId, body, Date.now());
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
