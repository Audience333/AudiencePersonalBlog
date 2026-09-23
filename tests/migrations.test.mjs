import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import test from 'node:test';

import { openBlogDatabase } from '../src/lib/db.ts';
import { createLegacyDatabase, temporaryDatabase } from './helpers/legacy-db.mjs';

test('migrates a legacy database without losing content and remains repeatable', () => {
  const path = temporaryDatabase('legacy');
  createLegacyDatabase(path).close();

  const first = openBlogDatabase(path);
  const post = first.prepare(`
    SELECT title, scheduled_at, archived, comments_enabled, cover_image
    FROM posts WHERE slug = ?
  `).get('kept-post');

  assert.deepEqual(post, {
    title: '保留文章',
    scheduled_at: null,
    archived: 0,
    comments_enabled: 1,
    cover_image: null,
  });
  assert.equal(first.pragma('user_version', { simple: true }), 1);
  first.close();

  const second = openBlogDatabase(path);
  assert.equal(second.prepare("SELECT COUNT(*) AS count FROM posts WHERE slug = 'kept-post'").get().count, 1);
  assert.equal(second.pragma('user_version', { simple: true }), 1);
  second.close();

  for (const suffix of ['', '-wal', '-shm']) rmSync(path + suffix, { force: true });
});
