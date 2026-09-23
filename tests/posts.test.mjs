import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import test from 'node:test';

import { openBlogDatabase } from '../src/lib/db.ts';
import {
  findAdjacentPublicPosts,
  findPublicPostBySlug,
  listPublicPosts,
  resolvePostState,
} from '../src/lib/posts.ts';
import { getRuntimeSettings } from '../src/lib/settings.ts';
import { temporaryDatabase } from './helpers/legacy-db.mjs';

function createPost(db, input) {
  const result = db.prepare(`INSERT INTO posts
    (slug, title, description, body_markdown, tags_json, status, published_at,
      scheduled_at, archived, comments_enabled, cover_image, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      input.slug, input.slug, `${input.slug} description`, '正文', input.tags_json ?? '[]', input.status,
      input.published_at ?? '2026-09-20', input.scheduled_at ?? null, input.archived ?? 0,
      1, null, 1, 1,
    );
  return Number(result.lastInsertRowid);
}

test('keeps drafts, archived posts, and future schedules out of every public query', () => {
  const path = temporaryDatabase('public-posts');
  const db = openBlogDatabase(path);
  db.prepare('DELETE FROM posts').run();
  const boundary = Date.parse('2026-09-22T16:00:00.000Z');

  createPost(db, { slug: 'draft', status: 'draft' });
  const publishedId = createPost(db, { slug: 'published', status: 'published', published_at: '2026-09-22' });
  createPost(db, { slug: 'archived', status: 'published', archived: 1 });
  createPost(db, {
    slug: 'scheduled', status: 'published', published_at: '2026-09-23', scheduled_at: boundary,
  });
  createPost(db, { slug: 'bad-tags', status: 'published', tags_json: '{not-json' });

  assert.equal(findPublicPostBySlug('scheduled', boundary - 1, db), undefined);
  assert.equal(findPublicPostBySlug('scheduled', boundary, db)?.slug, 'scheduled');
  assert.deepEqual(
    listPublicPosts({}, boundary, db).items.map((post) => post.slug),
    ['scheduled', 'published', 'bad-tags'],
  );
  assert.equal(findAdjacentPublicPosts(publishedId, boundary, db).next?.slug, 'scheduled');
  assert.equal(resolvePostState(findPublicPostBySlug('scheduled', boundary, db), boundary), 'published');
  assert.equal(resolvePostState(db.prepare("SELECT * FROM posts WHERE slug = 'draft'").get(), boundary), 'draft');
  assert.equal(resolvePostState(db.prepare("SELECT * FROM posts WHERE slug = 'archived'").get(), boundary), 'archived');
  assert.equal(resolvePostState(db.prepare("SELECT * FROM posts WHERE slug = 'scheduled'").get(), boundary - 1), 'scheduled');

  db.close();
  for (const suffix of ['', '-wal', '-shm']) rmSync(path + suffix, { force: true });
});

test('uses safe interaction defaults when runtime settings have not been configured', () => {
  const path = temporaryDatabase('runtime-settings');
  const db = openBlogDatabase(path);

  assert.deepEqual(getRuntimeSettings(db), {
    registrationOpen: true,
    blockedCommentKeywords: [],
    defaultCommentsEnabled: true,
  });

  db.close();
  for (const suffix of ['', '-wal', '-shm']) rmSync(path + suffix, { force: true });
});
