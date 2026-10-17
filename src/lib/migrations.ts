import type Database from 'better-sqlite3';

interface ColumnInfo {
  name: string;
}

function columnNames(db: Database.Database, table: string): Set<string> {
  return new Set((db.pragma(`table_info(${table})`) as ColumnInfo[]).map((column) => column.name));
}

function addMissingColumn(db: Database.Database, table: string, column: string, definition: string) {
  if (!columnNames(db, table).has(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function addMissingPostColumns(db: Database.Database) {
  const additions = [
    ['scheduled_at', 'INTEGER'],
    ['archived', 'INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1))'],
    ['comments_enabled', 'INTEGER NOT NULL DEFAULT 1 CHECK(comments_enabled IN (0, 1))'],
    ['cover_image', 'TEXT'],
  ] as const;
  for (const [name, definition] of additions) addMissingColumn(db, 'posts', name, definition);
}

export function rebuildPostsFts(db: Database.Database): void {
  db.exec('DELETE FROM posts_fts');
  db.prepare(`INSERT INTO posts_fts(rowid, title, description, body, tags)
    SELECT id, title, description, body_markdown, tags_json FROM posts`).run();
}

export function runMigrations(db: Database.Database): void {
  const currentVersion = db.pragma('user_version', { simple: true }) as number;

  if (currentVersion < 1) {
    db.transaction(() => {
      addMissingPostColumns(db);
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_posts_visibility_date
        ON posts(status, archived, scheduled_at, published_at DESC, id DESC)
      `);
      db.pragma('user_version = 1');
    })();
  }

  if (currentVersion < 2) {
    db.transaction(() => {
      // 功能：浏览量、文章系列、评论嵌套回复
      addMissingColumn(db, 'posts', 'view_count', 'INTEGER NOT NULL DEFAULT 0');
      addMissingColumn(db, 'posts', 'series', 'TEXT');
      addMissingColumn(db, 'posts', 'series_order', 'INTEGER NOT NULL DEFAULT 0');
      addMissingColumn(db, 'comments', 'parent_id', 'INTEGER REFERENCES comments(id)');
      // 功能：自托管访问统计（不记录 IP，只保留路径、来源与 UA）
      db.exec(`
        CREATE TABLE IF NOT EXISTS page_views (
          id INTEGER PRIMARY KEY,
          path TEXT NOT NULL,
          referrer TEXT NOT NULL DEFAULT '',
          user_agent TEXT NOT NULL DEFAULT '',
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_page_views_time ON page_views(created_at);
        CREATE INDEX IF NOT EXISTS idx_page_views_path ON page_views(path, created_at);
      `);
      // 功能：FTS5 全文搜索（trigram 分词，支持中文子串匹配）
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(
          title, description, body, tags, tokenize = 'trigram'
        )
      `);
      rebuildPostsFts(db);
      db.pragma('user_version = 2');
    })();
  }

  if (currentVersion < 3) {
    db.transaction(() => {
      // 功能：用户头像
      addMissingColumn(db, 'users', 'avatar', 'TEXT');
      // 功能：留言墙（支持匿名昵称，需审核）
      db.exec(`
        CREATE TABLE IF NOT EXISTS guestbook (
          id INTEGER PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          nickname TEXT NOT NULL DEFAULT '匿名用户',
          body TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected')),
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_guestbook_status ON guestbook(status, created_at DESC);
        -- 功能：动态时间线（kind: site=网站动态, tech=科技资讯/快报）
        CREATE TABLE IF NOT EXISTS updates (
          id INTEGER PRIMARY KEY,
          kind TEXT NOT NULL DEFAULT 'site' CHECK(kind IN ('site', 'tech')),
          body TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        -- 功能：资源分享（访客投稿、管理员推荐徽章）
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
        CREATE INDEX IF NOT EXISTS idx_resources_status ON resources(status, created_at DESC);
        -- 功能：文章弹幕
        CREATE TABLE IF NOT EXISTS danmaku (
          id INTEGER PRIMARY KEY,
          post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          username TEXT NOT NULL,
          body TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'approved' CHECK(status IN ('approved', 'rejected')),
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_danmaku_post ON danmaku(post_id, status, created_at);
      `);
      db.pragma('user_version = 3');
    })();
  }
}
