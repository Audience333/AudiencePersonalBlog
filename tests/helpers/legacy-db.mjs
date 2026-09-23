import Database from 'better-sqlite3';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function temporaryDatabase(name) {
  return join(mkdtempSync(join(tmpdir(), 'personal-blog-')), `${name}.sqlite`);
}

export function createLegacyDatabase(path) {
  const db = new Database(path);
  db.exec(`
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE posts (
      id INTEGER PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      body_markdown TEXT NOT NULL,
      tags_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL CHECK(status IN ('draft', 'published')),
      published_at TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  db.prepare(`INSERT INTO posts
    (slug, title, description, body_markdown, tags_json, status, published_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('kept-post', '保留文章', '迁移测试文章', '正文', '[]', 'published', '2026-09-22', 1, 1);
  return db;
}
