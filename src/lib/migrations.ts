import type Database from 'better-sqlite3';

interface ColumnInfo {
  name: string;
}

function addMissingPostColumns(db: Database.Database) {
  const existing = new Set(
    (db.pragma('table_info(posts)') as ColumnInfo[]).map((column) => column.name),
  );
  const additions = [
    ['scheduled_at', 'INTEGER'],
    ['archived', 'INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1))'],
    ['comments_enabled', 'INTEGER NOT NULL DEFAULT 1 CHECK(comments_enabled IN (0, 1))'],
    ['cover_image', 'TEXT'],
  ] as const;

  for (const [name, definition] of additions) {
    if (!existing.has(name)) db.exec(`ALTER TABLE posts ADD COLUMN ${name} ${definition}`);
  }
}

export function runMigrations(db: Database.Database): void {
  const currentVersion = db.pragma('user_version', { simple: true }) as number;
  if (currentVersion >= 1) return;

  db.transaction(() => {
    addMissingPostColumns(db);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_posts_visibility_date
      ON posts(status, archived, scheduled_at, published_at DESC, id DESC)
    `);
    db.pragma('user_version = 1');
  })();
}
