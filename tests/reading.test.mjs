import assert from 'node:assert/strict';
import test from 'node:test';

import { estimateReadingMinutes, renderMarkdownDocument } from '../src/lib/reading.ts';

test('renders stable heading metadata for duplicate headings and sanitizes scripts', async () => {
  const result = await renderMarkdownDocument('## 安装\n\n正文\n\n## 安装\n\n```js\nalert(1)\n```');
  assert.deepEqual(result.headings.map(({ id }) => id), ['安装', '安装-2']);
  assert.match(result.html, /<h2 id="安装">安装<\/h2>/);
  assert.match(result.html, /<code class="language-js">alert\(1\)\n<\/code>/);
  assert.doesNotMatch((await renderMarkdownDocument('<script>alert(1)</script>')).html, /script/i);
});

test('estimates reading time for Chinese and Latin writing', () => {
  assert.ok(estimateReadingMinutes('汉'.repeat(1000)) >= 2);
  assert.equal(estimateReadingMinutes('one two three'), 1);
});
