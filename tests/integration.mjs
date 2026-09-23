import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const databasePath = resolve(root, 'data', 'integration-test.sqlite');
const uploadDirectory = resolve(root, 'data', 'integration-test-uploads');
const base = 'http://127.0.0.1:4399';
for (const suffix of ['', '-wal', '-shm']) rmSync(databasePath + suffix, { force: true });
rmSync(uploadDirectory, { recursive: true, force: true });
process.env.BLOG_DB_PATH = databasePath;
process.env.BLOG_UPLOAD_DIR = uploadDirectory;
const { createUser, getDb } = await import('../src/lib/db.ts');
const { hashPassword } = await import('../src/lib/auth.ts');
createUser('owner_test', await hashPassword('owner-test-password-123'), 'admin');

const child = spawn(process.execPath, ['dist/server/entry.mjs'], {
  cwd: root,
  env: { ...process.env, HOST: '127.0.0.1', PORT: '4399', NODE_ENV: 'production', BLOG_DB_PATH: databasePath },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverOutput = '';
child.stdout.on('data', (chunk) => { serverOutput += chunk.toString(); });
child.stderr.on('data', (chunk) => { serverOutput += chunk.toString(); });

async function ready() {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (child.exitCode !== null) throw new Error(`Server exited: ${serverOutput}`);
    try { const response = await fetch(base); if (response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Server did not start: ${serverOutput}`);
}

async function get(path, cookie = '') {
  return fetch(base + path, { headers: cookie ? { Cookie: cookie } : {}, redirect: 'manual' });
}

async function post(path, values, cookie = '', origin = base) {
  return fetch(base + path, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded', ...(cookie ? { Cookie: cookie } : {}) },
    body: new URLSearchParams(values),
    redirect: 'manual',
  });
}

async function upload(path, data, cookie = '', origin = base) {
  return fetch(base + path, {
    method: 'POST',
    headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}) },
    body: data,
    redirect: 'manual',
  });
}

function cookieFrom(response) {
  const value = response.headers.get('set-cookie') || '';
  const match = value.match(/blog_session=[^;]+/);
  assert.ok(match, `Missing session cookie: ${value}`);
  return match[0];
}

try {
  await ready();
  assert.equal((await get('/admin/')).status, 302);
  const home = await (await get('/')).text();
  assert.match(home, /archive-hero-v1\.png/);
  assert.match(home, /data-theme="ark"/);
  assert.equal((await get('/projects/personal-website/')).status, 200);

  const registration = await post('/api/auth/register', { username: 'reader_test', password: 'reader-test-password-123', confirm: 'reader-test-password-123' });
  assert.equal(registration.status, 303);
  const readerCookie = cookieFrom(registration);
  assert.equal((await get('/admin/', readerCookie)).status, 403);
  assert.equal((await post('/api/auth/login', { username: 'owner_test', password: 'wrong-password' })).headers.get('location'), '/login/?error=invalid');
  const adminLogin = await post('/api/auth/login', { username: 'owner_test', password: 'owner-test-password-123' });
  assert.equal(adminLogin.status, 303);
  const adminCookie = cookieFrom(adminLogin);
  assert.equal((await get('/admin/', adminCookie)).status, 200);

  assert.equal((await post('/api/admin/preview', { body: '# 预览' })).status, 401);
  assert.equal((await post('/api/admin/preview', { body: '# 预览' }, adminCookie, 'https://other.example')).status, 403);
  const preview = await post('/api/admin/preview', { body: '# 预览\n\n<script>alert(1)</script>' }, adminCookie);
  assert.equal(preview.status, 200);
  assert.match((await preview.json()).html, /<h1>预览<\/h1>/);

  const settingsUpdate = await post('/api/admin/settings', {
    registration_open: 'off', default_comments_enabled: 'on', blocked_comment_keywords: 'blocked phrase',
  }, adminCookie);
  assert.equal(settingsUpdate.status, 200);
  assert.equal((await post('/api/auth/register', {
    username: 'closed_reader', password: 'reader-test-password-123', confirm: 'reader-test-password-123',
  })).headers.get('location'), '/register/?error=closed');

  const closedCommentsPost = await post('/api/admin/posts', {
    slug: 'closed-comments', title: '关闭评论', description: '用于验证评论关闭的文章。',
    body: '正文内容。', published_at: '2026-09-18', tags: '测试', status: 'published', comments_enabled: 'off',
  }, adminCookie);
  assert.equal(closedCommentsPost.status, 200);
  const closedComment = await post('/api/comments', { slug: 'closed-comments', body: 'hello' }, readerCookie);
  assert.equal(closedComment.status, 303);
  assert.match(closedComment.headers.get('location'), /comment=closed/);

  const blockedComment = await post('/api/comments', { slug: 'welcome', body: 'blocked phrase' }, readerCookie);
  assert.equal(blockedComment.status, 303);
  assert.equal(getDb().prepare("SELECT status FROM comments WHERE body = 'blocked phrase'").get().status, 'rejected');

  const imageData = new FormData();
  const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlX1JQAAAAASUVORK5CYII=', 'base64');
  imageData.set('image', new Blob([tinyPng], { type: 'image/png' }), 'cover.png');
  const imageUpload = await upload('/api/admin/uploads', imageData, adminCookie);
  assert.equal(imageUpload.status, 200);
  const imageResult = await imageUpload.json();
  assert.match(imageResult.url, /^\/api\/uploads\/[a-f0-9-]+\.png$/);
  const uploadedImage = await get(imageResult.url);
  assert.equal(uploadedImage.status, 200);
  assert.equal(uploadedImage.headers.get('content-type'), 'image/png');

  const projectDraft = await post('/api/admin/projects', {
    slug: 'test-project', title: '测试作品', description: '用于完整流程测试的作品',
    body: '# 作品说明\n\n这里是正文。', year: '2026', tools: 'Astro, SQLite', featured: 'on',
    cover_image: imageResult.url, status: 'draft',
  }, adminCookie);
  assert.equal(projectDraft.status, 200);
  const projectDraftResult = await projectDraft.json();
  assert.equal((await get('/projects/test-project/')).status, 404);
  const projectId = Number(new URL(projectDraftResult.location, base).searchParams.get('id'));
  const projectPublish = await post('/api/admin/projects', {
    id: String(projectId), slug: 'test-project', title: '测试作品', description: '用于完整流程测试的作品',
    body: '# 作品说明\n\n这里是正文。', year: '2026', tools: 'Astro, SQLite', featured: 'on',
    cover_image: imageResult.url, status: 'published',
  }, adminCookie);
  assert.equal(projectPublish.status, 200);
  const publishedProject = await (await get('/projects/test-project/')).text();
  assert.match(publishedProject, /测试作品/);
  assert.match(publishedProject, new RegExp(imageResult.url));

  const like = await post('/api/likes', { slug: 'welcome' }, readerCookie);
  assert.equal(like.status, 303);
  const comment = await post('/api/comments', { slug: 'welcome', body: '很喜欢这个网站！' }, readerCookie);
  assert.equal(comment.status, 303);
  let article = await (await get('/blog/welcome/')).text();
  assert.doesNotMatch(article, /很喜欢这个网站！/);
  const dashboard = await (await get('/admin/', adminCookie)).text();
  assert.match(dashboard, /很喜欢这个网站！/);
  const commentId = getDb().prepare("SELECT id FROM comments WHERE body = '很喜欢这个网站！'").get().id;
  assert.equal((await post('/api/admin/comments', { id: String(commentId), status: 'approved' }, adminCookie)).status, 303);
  article = await (await get('/blog/welcome/')).text();
  assert.match(article, /很喜欢这个网站！/);

  const saveDraft = await post('/api/admin/posts', {
    slug: 'test-post', title: '测试文章', description: '用于完整流程测试的文章',
    body: '# 标题\n\n<script>alert(1)</script>正文', published_at: '2026-09-17', tags: '测试, 技术', status: 'draft',
  }, adminCookie);
  assert.equal(saveDraft.status, 200);
  const draftResult = await saveDraft.json();
  assert.equal(draftResult.ok, true);
  assert.equal((await get('/blog/test-post/')).status, 404);
  const postId = Number(new URL(draftResult.location, base).searchParams.get('id'));
  assert.equal((await get(`/admin/preview/?id=${postId}`)).status, 302);
  const adminDraftPreview = await (await get(`/admin/preview/?id=${postId}`, adminCookie)).text();
  assert.match(adminDraftPreview, /测试文章/);
  const publish = await post('/api/admin/posts', {
    id: String(postId), slug: 'test-post', title: '测试文章', description: '用于完整流程测试的文章',
    body: '# 标题\n\n<script>alert(1)</script>正文', published_at: '2026-09-17', tags: '测试, 技术', status: 'published',
  }, adminCookie);
  assert.equal(publish.status, 200);
  const published = await (await get('/blog/test-post/')).text();
  assert.match(published, /测试文章/);
  assert.doesNotMatch(published, /<script>alert\(1\)<\/script>/);

  assert.equal((await post('/api/admin/posts', { title: '非法修改' }, readerCookie)).status, 401);
  assert.equal((await post('/api/admin/projects', { title: '非法修改' }, readerCookie)).status, 401);
  assert.equal((await upload('/api/admin/uploads', new FormData(), readerCookie)).status, 401);
  assert.equal((await post('/api/likes', { slug: 'welcome' }, readerCookie, 'https://other.example')).status, 403);
  console.log('通过：注册、登录、权限、点赞、评论审核、文章与作品草稿/发布、封面上传、Markdown 清理与同源检查。');
} finally {
  if (child.exitCode === null) {
    child.kill();
    await new Promise((resolve) => child.once('exit', resolve));
  }
  getDb().close();
  for (const suffix of ['', '-wal', '-shm']) rmSync(databasePath + suffix, { force: true });
  rmSync(uploadDirectory, { recursive: true, force: true });
}
