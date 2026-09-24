import assert from 'node:assert/strict';
import test from 'node:test';
import { absoluteUrl, articleJsonLd, escapeXml, serializeJsonLd } from '../src/lib/seo.ts';

test('escapes XML and JSON-LD values for document contexts', () => {
  assert.equal(escapeXml(`A&B<"'`), 'A&amp;B&lt;&quot;&apos;');
  assert.doesNotMatch(serializeJsonLd({ headline: '</script>' }), /<\/script>/i);
});

test('builds absolute canonical URLs from the configured public origin', () => {
  process.env.PUBLIC_SITE_ORIGIN = 'https://example.test';
  assert.equal(absoluteUrl('/blog/标签/'), 'https://example.test/blog/%E6%A0%87%E7%AD%BE/');
  delete process.env.PUBLIC_SITE_ORIGIN;
});

test('includes configured author and image in article structured metadata', () => {
  const metadata = articleJsonLd({ title: '文章', description: '摘要', published_at: '2026-09-22', cover_image: '/cover.png' }, 'https://example.test/blog/article/');
  assert.equal(metadata.author.name, '观众');
  assert.equal(metadata.image, '/cover.png');
});
