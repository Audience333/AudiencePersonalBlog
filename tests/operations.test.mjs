import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { mkdtempSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkHealth, createHealthResponse } from '../src/lib/health.ts';

test('reports health without exposing database errors', async () => {
  assert.equal(checkHealth({ prepare() { return { get() { return { value: 1 }; } }; } }), true);
  assert.equal(checkHealth({ prepare() { throw new Error('database unavailable'); } }), false);
  const failure = createHealthResponse(false);
  assert.equal(failure.status, 503);
  assert.deepEqual(await failure.json(), { ok: false });
});

test('documents every supported setup and operations command', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  const readme = readFileSync('README.md', 'utf8');
  const deployGuide = readFileSync('docs/deploy.md', 'utf8');
  const environment = readFileSync('.env.example', 'utf8');
  const service = readFileSync('deploy/personal-blog.service.example', 'utf8');
  const caddy = readFileSync('deploy/Caddyfile.example', 'utf8');

  for (const command of ['dev', 'check', 'build', 'test:unit', 'test:integration', 'backup', 'start', 'admin:create']) {
    assert.ok(packageJson.scripts[command], `package command must exist: ${command}`);
    assert.match(readme, new RegExp(`npm run ${command.replace(':', '\\:')}|npm ${command.replace(':', '\\:')}`));
  }
  for (const variable of ['PUBLIC_SITE_ORIGIN', 'BLOG_DB_PATH', 'BLOG_UPLOAD_DIR', 'HOST', 'PORT', 'NODE_ENV']) {
    assert.match(environment, new RegExp(`^${variable}=`, 'm'));
    assert.match(readme, new RegExp(variable));
    assert.match(deployGuide, new RegExp(variable));
  }
  assert.match(readme, /Markdown/);
  assert.match(readme, /评论/);
  assert.match(readme, /搜索/);
  assert.match(readme, /RSS/);
  assert.match(readme, /备份/);
  assert.match(deployGuide, /npm ci/);
  assert.match(deployGuide, /4321/);
  assert.match(service, /EnvironmentFile=\/etc\/personal-blog\.env/);
  assert.match(caddy, /127\.0\.0\.1:4321/);
});

test('ships a substantially smaller WebP hero image', () => {
  const pngSize = statSync('public/archive-hero-v1.png').size;
  const webpSize = statSync('public/archive-hero-v1.webp').size;
  assert.ok(webpSize < pngSize / 2, `Expected WebP ${webpSize} to be less than half of PNG ${pngSize}`);
});

test('backs up the database and uploaded files into a readable snapshot', () => {
  const temp = mkdtempSync(join(tmpdir(), 'personal-blog-backup-'));
  const sourceDatabase = join(temp, 'source.sqlite');
  const uploads = join(temp, 'uploads');
  const output = join(temp, 'backups');
  mkdirSync(uploads);
  writeFileSync(join(uploads, 'proof.txt'), 'uploaded proof');
  const source = new Database(sourceDatabase);
  source.exec('CREATE TABLE posts (slug TEXT PRIMARY KEY, title TEXT NOT NULL);');
  source.prepare('INSERT INTO posts (slug, title) VALUES (?, ?)').run('backup-proof', '备份验证');
  source.close();

  const destination = execFileSync(process.execPath, ['scripts/backup.mjs', '--output', output], {
    cwd: process.cwd(),
    env: { ...process.env, BLOG_DB_PATH: sourceDatabase, BLOG_UPLOAD_DIR: uploads },
    encoding: 'utf8',
  }).trim();
  const restored = new Database(join(destination, 'blog.sqlite'), { readonly: true });
  assert.equal(restored.prepare('SELECT title FROM posts WHERE slug = ?').get('backup-proof').title, '备份验证');
  restored.close();
  assert.equal(readFileSync(join(destination, 'uploads', 'proof.txt'), 'utf8'), 'uploaded proof');
});
