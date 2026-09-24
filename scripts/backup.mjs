import Database from 'better-sqlite3';
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const outputIndex = process.argv.indexOf('--output');
const output = resolve(outputIndex >= 0 ? process.argv[outputIndex + 1] : 'data/backups');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const destination = resolve(output, stamp);
const databasePath = resolve(process.env.BLOG_DB_PATH || './data/blog.sqlite');
const uploadsPath = resolve(process.env.BLOG_UPLOAD_DIR || './data/uploads');
mkdirSync(destination, { recursive: true });
try {
  const db = new Database(databasePath, { readonly: true });
  await db.backup(resolve(destination, 'blog.sqlite'));
  db.close();
  cpSync(uploadsPath, resolve(destination, 'uploads'), { recursive: true, force: false, errorOnExist: false });
  writeFileSync(resolve(destination, 'manifest.json'), JSON.stringify({ createdAt: new Date().toISOString(), database: 'blog.sqlite', uploads: 'uploads' }, null, 2));
  console.log(destination);
} catch (error) { console.error(error); process.exitCode = 1; }
