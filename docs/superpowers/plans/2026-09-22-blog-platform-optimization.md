# Personal Blog Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing Astro and SQLite portfolio blog into a configurable, searchable, publishing-ready personal blog template with a safer editor and documented self-hosting operations.

**Architecture:** Keep one Astro Node standalone application and one SQLite database. Add ordered schema migrations, focused configuration/query/SEO modules, server-rendered public pages, protected administration APIs, and provider-neutral Linux deployment artifacts while preserving existing data and the archive theme.

**Tech Stack:** Astro 7.3, TypeScript 6, Node.js 24.15+, better-sqlite3 13, marked 18, sanitize-html 2, `@js-temporal/polyfill` for named-timezone scheduling, native CSS, Node test runner, and Sharp as a development-only asset tool.

**Spec:** `docs/superpowers/specs/2026-09-22-blog-platform-optimization-design.md`

## Global Constraints

- Keep Astro 7, the Node standalone adapter, TypeScript, and SQLite.
- Keep frontend pages, API routes, administration pages, and the database in one application process.
- Preserve all existing users, sessions, posts, projects, comments, likes, settings, and uploaded project covers.
- Keep the archive theme and responsive behavior; new controls must be keyboard accessible.
- Default timezone is exactly `Asia/Shanghai`; posts per page is exactly `10` unless changed in site configuration.
- Store precise schedule values as UTC millisecond timestamps and render them in the configured timezone.
- Keep the existing 4 MB PNG/JPEG/WebP/GIF upload limit and signature checks.
- Do not add an external CMS, search service, mail service, object storage, frontend framework, automatic saves, revision history, public draft URLs, or a general media library.
- Every public discovery path must share the same post visibility predicate.
- Every task ends with relevant tests passing and an isolated Git commit.

## File Structure

- `src/config/site.ts`: version-controlled site identity and public defaults.
- `src/lib/migrations.ts`: ordered, transactional SQLite migrations.
- `src/lib/db.ts`: connection ownership, row types, existing user/project/comment primitives.
- `src/lib/posts.ts`: post state, visibility, search, tags, pagination, and adjacent-post queries.
- `src/lib/settings.ts`: typed runtime settings backed by the existing settings table.
- `src/lib/reading.ts`: reading-time and heading metadata.
- `src/lib/seo.ts`: absolute URLs, XML escaping, and structured metadata helpers.
- `src/components/ArticleToc.astro`: responsive article table of contents.
- `src/components/Pagination.astro`: accessible query-preserving pagination.
- `src/pages/blog/`: search/list, tag archives, and enriched article detail.
- `src/pages/admin/`: editor, preview, dashboard, and settings UI.
- `src/pages/api/admin/`: protected save, preview, upload, and settings mutations.
- `src/pages/rss.xml.ts`, `src/pages/sitemap.xml.ts`, `src/pages/api/health.ts`: machine-readable public and operational routes.
- `src/middleware.ts`: baseline security headers.
- `scripts/start.mjs`, `scripts/backup.mjs`, `scripts/optimize-assets.mjs`: production start, backup, and deterministic asset generation.
- `tests/*.test.mjs`: direct module tests; `tests/integration.mjs`: production-server behavior.
- `deploy/personal-blog.service.example`, `deploy/Caddyfile.example`: Linux process and proxy examples.
- `README.md`, `docs/deploy.md`, `.env.example`: GitHub user and operator documentation.

## Review Focus

- A legacy database with existing rows and a partially missing optional setting must migrate without overwriting content; Task 1 pins this with a fixture migration test.
- Unicode tags, percent signs, underscores, empty search text, and excessive page numbers must return deterministic public results without SQL wildcard surprises; Task 4 pins these inputs.
- A future schedule around a timezone date boundary must stay private until its UTC instant and become public immediately afterward; Task 2 pins both sides of the boundary.
- Draft, archived, and scheduled posts must never appear through detail pages, search, adjacent links, RSS, sitemap, or homepage queries; Tasks 2, 4, and 7 each pin their own output.
- A backup taken while WAL mode is active must contain a readable database and uploaded files; Task 8 opens the backup and asserts stored content.

---

### Task 1: Central Configuration and Safe Database Migrations

**Files:**
- Create: `src/config/site.ts`
- Create: `src/lib/migrations.ts`
- Create: `tests/helpers/legacy-db.mjs`
- Create: `tests/migrations.test.mjs`
- Create: `.env.example`
- Modify: `src/lib/db.ts`
- Modify: `src/layouts/BaseLayout.astro`
- Modify: `package.json`

**Interfaces:**
- Produces: `siteConfig: SiteConfig`, `getPublicOrigin(requestUrl?: URL): URL`.
- Produces: `runMigrations(db: Database.Database): void`.
- Produces: `openBlogDatabase(path: string): Database.Database`; `getDb()` remains the cached application connection.
- Produces post fields `scheduled_at: number | null`, `archived: 0 | 1`, `comments_enabled: 0 | 1`, `cover_image: string | null`.
- Produces test helpers `temporaryDatabase(name: string): string` and `createLegacyDatabase(path: string): Database.Database`.

- [ ] **Step 1: Add the migration test and test command**

Create a temporary legacy database with the old posts shape and one post, run `openBlogDatabase()`, and assert preservation plus the new columns. The helper has concrete ownership of the fixture:

```js
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
      id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
      description TEXT NOT NULL, body_markdown TEXT NOT NULL,
      tags_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL CHECK(status IN ('draft', 'published')),
      published_at TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
  `);
  db.prepare(`INSERT INTO posts
    (slug, title, description, body_markdown, tags_json, status, published_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('kept-post', '保留文章', '迁移测试文章', '正文', '[]', 'published', '2026-09-22', 1, 1);
  return db;
}

test('migrates a legacy database without losing content', () => {
  const path = temporaryDatabase('legacy');
  createLegacyDatabase(path).close();
  const db = openBlogDatabase(path);
  const post = db.prepare('SELECT title, scheduled_at, archived, comments_enabled, cover_image FROM posts WHERE slug = ?').get('kept-post');
  assert.deepEqual(post, {
    title: '保留文章', scheduled_at: null, archived: 0, comments_enabled: 1, cover_image: null,
  });
  assert.equal(db.pragma('user_version', { simple: true }), 1);
  db.close();
});
```

Add `"test:unit": "node --test tests/*.test.mjs"` to `package.json`.

- [ ] **Step 2: Run the migration test and verify failure**

Run: `npm run test:unit -- --test-name-pattern="migrates a legacy"`

Expected: FAIL because `openBlogDatabase` and `src/lib/migrations.ts` do not exist.

- [ ] **Step 3: Add site configuration and ordered migration 1**

Define the stable interface:

```ts
export interface SiteConfig {
  name: string;
  author: string;
  description: string;
  timezone: string;
  postsPerPage: number;
  footer: string;
  defaultOgImage: string;
  socialLinks: ReadonlyArray<{ label: string; href: string }>;
}

export const siteConfig: SiteConfig = {
  name: '观众 · 作品与博客',
  author: '观众',
  description: '一个记录作品、想法与学习过程的个人网站。',
  timezone: 'Asia/Shanghai',
  postsPerPage: 10,
  footer: '慢慢写，认真做。',
  defaultOgImage: '/archive-hero-v1.png',
  socialLinks: [],
};

export function getPublicOrigin(requestUrl?: URL): URL {
  const configured = process.env.PUBLIC_SITE_ORIGIN;
  if (configured) return new URL(configured);
  if (requestUrl) return new URL(requestUrl.origin);
  return new URL('http://localhost:4321');
}
```

Migration 1 must inspect `PRAGMA table_info(posts)`, add only missing columns, set `PRAGMA user_version = 1`, and execute inside `db.transaction(...)`. Refactor current schema creation into `openBlogDatabase(path)` and have `getDb()` cache its result. Keep all existing seed guards.

Update `BaseLayout.astro` to use `siteConfig.name`, `siteConfig.description`, `siteConfig.author`, and `siteConfig.footer`. Add documented variables to `.env.example` with non-secret example values.

- [ ] **Step 4: Run unit, type, and build checks**

Run: `npm run test:unit`

Expected: PASS, including running migration twice without duplicate-column errors.

Run: `npm run check`

Expected: 0 errors and 0 warnings.

Run: `npm run build`

Expected: server build completes.

- [ ] **Step 5: Commit Task 1**

```bash
git add package.json .env.example src/config/site.ts src/lib/migrations.ts src/lib/db.ts src/layouts/BaseLayout.astro tests/helpers/legacy-db.mjs tests/migrations.test.mjs
git commit -m "feat: add site config and database migrations"
```

### Task 2: Public Post Repository, Scheduling, and Runtime Settings

**Files:**
- Create: `src/lib/posts.ts`
- Create: `src/lib/settings.ts`
- Create: `tests/posts.test.mjs`
- Modify: `src/lib/db.ts`
- Modify: `src/pages/index.astro`
- Modify: `src/pages/blog/[...slug].astro`

**Interfaces:**
- Consumes: migrated `PostRow` and `getDb()` from Task 1.
- Produces: `type PublicPostFilters = { q?: string; tag?: string; page?: number; pageSize?: number }`.
- Produces: `type PostPage = { items: PostRow[]; page: number; pageSize: number; totalItems: number; totalPages: number }`.
- Produces: `resolvePostState(post: PostRow, now?: number): 'draft' | 'scheduled' | 'published' | 'archived'`.
- Produces: `listPublicPosts(filters?: PublicPostFilters, now?: number, db?: Database.Database): PostPage`.
- Produces: `findPublicPostBySlug(slug: string, now?: number, db?: Database.Database): PostRow | undefined`.
- Produces: `findAdjacentPublicPosts(id: number, now?: number, db?: Database.Database): { previous?: PostRow; next?: PostRow }`.
- Produces: `listPublicTags(now?: number, db?: Database.Database): Array<{ tag: string; count: number }>`.
- Produces: `RuntimeSettings`, `getRuntimeSettings(db?: Database.Database)`, `updateRuntimeSettings(input, db?: Database.Database)`.

- [ ] **Step 1: Write visibility and timezone-boundary tests**

Seed draft, published, archived, future-scheduled, and due-scheduled posts. Pin the boundary explicitly:

```js
const boundary = Date.parse('2026-09-22T16:00:00.000Z');
assert.equal(findPublicPostBySlug('scheduled', boundary - 1), undefined);
assert.equal(findPublicPostBySlug('scheduled', boundary)?.slug, 'scheduled');
assert.deepEqual(listPublicPosts({}, boundary).items.map((post) => post.slug), ['scheduled', 'published']);
assert.equal(findAdjacentPublicPosts(publishedId, boundary).next?.slug, 'scheduled');
```

Also assert that missing runtime rows produce `{ registrationOpen: true, blockedCommentKeywords: [], defaultCommentsEnabled: true }`.

- [ ] **Step 2: Run tests and verify public-query failure**

Run: `npm run test:unit -- --test-name-pattern="public|scheduled|runtime settings"`

Expected: FAIL because `src/lib/posts.ts` and `src/lib/settings.ts` are absent.

- [ ] **Step 3: Implement one visibility predicate and typed settings**

Use one SQL fragment for all public queries:

```ts
const PUBLIC_WHERE = `status = 'published' AND archived = 0 AND (scheduled_at IS NULL OR scheduled_at <= @now)`;
```

Escape `LIKE` metacharacters with `value.replace(/[\\%_]/g, '\\$&')` and use `ESCAPE '\\'`. Parse `tags_json` defensively; malformed stored JSON yields an empty tag array rather than crashing a page. Clamp page size to `1..50`, page to at least `1`, and return the last valid page when the requested page is excessive.

Store runtime settings as JSON values under namespaced keys `runtime.registration_open`, `runtime.blocked_comment_keywords`, and `runtime.default_comments_enabled`. Validate at read and write boundaries.

Replace homepage and article-detail direct post queries with the public repository functions.

- [ ] **Step 4: Run repository tests and regression build**

Run: `npm run test:unit`

Expected: PASS for every visibility state, malformed tags, and timezone boundary.

Run: `npm run check && npm run build && npm run test:integration`

Expected: all existing flows remain green.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/lib/posts.ts src/lib/settings.ts src/lib/db.ts src/pages/index.astro "src/pages/blog/[...slug].astro" tests/posts.test.mjs
git commit -m "feat: centralize public post visibility"
```

### Task 3: Publishing and Interaction Controls

**Files:**
- Create: `src/lib/time.ts`
- Create: `tests/time.test.mjs`
- Create: `src/pages/admin/settings.astro`
- Create: `src/pages/api/admin/settings.ts`
- Modify: `src/pages/admin/index.astro`
- Modify: `src/pages/admin/editor.astro`
- Modify: `src/pages/api/admin/posts.ts`
- Modify: `src/pages/api/auth/register.ts`
- Modify: `src/pages/api/comments.ts`
- Modify: `src/pages/blog/[...slug].astro`
- Modify: `tests/integration.mjs`
- Modify: `src/styles/global.css`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: Task 2 settings and post-state functions.
- Produces: `parseZonedDateTime(value: string, timezone: string): number | undefined` and `formatZonedDateTime(timestamp: number, timezone: string): string`.
- Produces: admin settings POST accepting `registration_open`, `default_comments_enabled`, and newline-separated `blocked_comment_keywords`.
- Produces: post save fields `scheduled_at`, `archived`, `comments_enabled`, and `cover_image`.

- [ ] **Step 1: Extend integration tests for controls and moderation**

Add assertions that:

```js
assert.equal((await post('/api/auth/register', readerValues)).headers.get('location'), '/register/?error=closed');
assert.equal((await post('/api/comments', { slug: 'closed-comments', body: 'hello' }, readerCookie)).status, 303);
assert.match((await post('/api/comments', { slug: 'closed-comments', body: 'hello' }, readerCookie)).headers.get('location'), /comment=closed/);
assert.equal(getDb().prepare("SELECT status FROM comments WHERE body = 'blocked phrase'").get().status, 'rejected');
```

In `tests/time.test.mjs`, assert `parseZonedDateTime('2026-09-23T00:00', 'Asia/Shanghai')` equals `Date.parse('2026-09-22T16:00:00.000Z')`, an invalid local date returns `undefined`, and a DST overlap in `America/New_York` resolves through Temporal without using the server's timezone. Verify a future scheduled post returns 404 publicly, an archived post returns 404, and admin dashboard labels all four resolved states.

- [ ] **Step 2: Run integration test and verify failure**

Run: `npm run build && npm run test:integration`

Expected: FAIL because registration, comments, post saving, and admin labels do not read the new controls.

- [ ] **Step 3: Add validated admin controls**

Install `@js-temporal/polyfill` as a production dependency. Implement the conversion with `Temporal.PlainDateTime.from(value).toZonedDateTime(timezone).toInstant().epochMilliseconds`; catch `RangeError` and return `undefined`. Format through `Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone })`.

In the posts API, parse the local schedule with `parseZonedDateTime` and reject invalid dates. Accept checkbox booleans only from `on`/missing values. Validate cover URLs through the upload filename helper or `http`/`https` URL parsing. Pass every `PostRow` field to `savePost`.

Before registration, return `/register/?error=closed` when `registrationOpen` is false. Before accepting a comment, require `findPublicPostBySlug`, require `comments_enabled === 1`, and return `comment=closed` when disabled. Normalize comment and keywords with `normalize('NFKC').toLocaleLowerCase('zh-CN')`; insert a match with status `rejected`, otherwise `pending`.

Add same-origin and administrator checks to settings updates. Limit keywords to 100 entries and 40 characters each. Show state, schedule, archive, and comment controls in editor and dashboard.

- [ ] **Step 4: Run integration, type, and unit tests**

Run: `npm run check && npm run build && npm run test:unit && npm run test:integration`

Expected: PASS; closed registration does not affect existing logins and historical approved comments remain visible.

- [ ] **Step 5: Commit Task 3**

```bash
git add package.json package-lock.json src/lib/time.ts tests/time.test.mjs src/pages/admin/settings.astro src/pages/api/admin/settings.ts src/pages/admin/index.astro src/pages/admin/editor.astro src/pages/api/admin/posts.ts src/pages/api/auth/register.ts src/pages/api/comments.ts "src/pages/blog/[...slug].astro" src/styles/global.css tests/integration.mjs
git commit -m "feat: add publishing and interaction controls"
```

### Task 4: Search, Tag Archives, and Pagination

**Files:**
- Create: `src/components/Pagination.astro`
- Create: `src/pages/blog/tags/[tag].astro`
- Modify: `src/pages/blog/index.astro`
- Modify: `src/pages/blog/[...slug].astro`
- Modify: `src/styles/global.css`
- Modify: `tests/posts.test.mjs`
- Modify: `tests/integration.mjs`

**Interfaces:**
- Consumes: `listPublicPosts()` and `listPublicTags()` from Task 2.
- Produces: `Pagination` props `{ page: number; totalPages: number; basePath: string; query?: Record<string, string> }`.

- [ ] **Step 1: Pin filtering inputs and public HTML behavior**

Add direct query tests for Chinese tags, literal `%` and `_`, whitespace-only `q`, combined tag and search, `page=0`, and `page=9999`. Add server assertions that search controls have labels, tag URLs are encoded, canonical page content excludes drafts, and pagination preserves `q` and `tag`.

```js
assert.deepEqual(listPublicPosts({ q: '100%_真实' }).items.map(({ slug }) => slug), ['literal-wildcards']);
assert.equal(listPublicPosts({ page: 9999, pageSize: 2 }).page, 3);
const searchHtml = await (await get('/blog/?q=Astro&page=2')).text();
assert.match(searchHtml, /name="q"[^>]*value="Astro"/);
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm run test:unit -- --test-name-pattern="search|tag|page"`

Expected: FAIL until wildcard escaping and excessive-page clamping are implemented.

- [ ] **Step 3: Build discovery pages and accessible pagination**

Render a GET search form, active-filter summary, clickable tag chips, result count, and empty state in `/blog/`. Decode the tag route once, reject tags over 20 characters with 404, and query the same repository function. Pagination builds URLs with `URLSearchParams`, disables unavailable directions as text, and renders `aria-current="page"` for the current number.

Add archive-theme styles for search fields, tag counts, active filters, and compact mobile pagination.

- [ ] **Step 4: Run all public-discovery tests**

Run: `npm run check && npm run build && npm run test:unit && npm run test:integration`

Expected: PASS and no private slug appears in any search or tag response.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/components/Pagination.astro src/pages/blog/index.astro "src/pages/blog/tags/[tag].astro" "src/pages/blog/[...slug].astro" src/styles/global.css tests/posts.test.mjs tests/integration.mjs
git commit -m "feat: add blog search tags and pagination"
```

### Task 5: Reading Metadata and Article Navigation

**Files:**
- Create: `src/lib/reading.ts`
- Create: `src/components/ArticleToc.astro`
- Create: `tests/reading.test.mjs`
- Modify: `src/lib/markdown.ts`
- Modify: `src/pages/blog/[...slug].astro`
- Modify: `src/styles/global.css`
- Modify: `tests/integration.mjs`

**Interfaces:**
- Produces: `Heading = { depth: 2 | 3; id: string; text: string }`.
- Produces: `RenderedMarkdown = { html: string; headings: Heading[]; readingMinutes: number }`.
- Produces: `renderMarkdownDocument(source: string): Promise<RenderedMarkdown>` while preserving `renderMarkdown(source): Promise<string>` for project pages.
- Consumes: `findAdjacentPublicPosts()` from Task 2.

- [ ] **Step 1: Write Markdown metadata tests**

Pin duplicate headings, inline formatting, fewer than two headings, Chinese reading length, script sanitization, and code blocks:

```js
const result = await renderMarkdownDocument('## 安装\n\n正文\n\n## 安装\n\n```js\nalert(1)\n```');
assert.deepEqual(result.headings.map(({ id }) => id), ['安装', '安装-2']);
assert.match(result.html, /<h2 id="安装">安装<\/h2>/);
assert.doesNotMatch((await renderMarkdownDocument('<script>alert(1)</script>')).html, /script/);
assert.ok(estimateReadingMinutes('汉'.repeat(1000)) >= 2);
```

- [ ] **Step 2: Run the metadata test and verify failure**

Run: `npm run test:unit -- --test-name-pattern="Markdown|heading|reading"`

Expected: FAIL because structured rendering and reading helpers are absent.

- [ ] **Step 3: Add structured rendering and article controls**

Use a per-render slug counter so duplicate IDs are stable and separate articles cannot affect each other. Extract plain heading text before sanitization. Estimate at 500 CJK characters or 220 whitespace-separated words per minute and return at least one minute.

On article pages render reading minutes, `ArticleToc` only for two or more headings, previous/next public links, a progress element with `aria-hidden="true"`, and code copy buttons initialized by a small client script. Respect `prefers-reduced-motion` by disabling animated progress transitions.

- [ ] **Step 4: Verify metadata, sanitization, and responsive output**

Run: `npm run check && npm run build && npm run test:unit && npm run test:integration`

Expected: PASS; sanitized preview HTML and published HTML use the same structured renderer.

- [ ] **Step 5: Commit Task 5**

```bash
git add src/lib/reading.ts src/lib/markdown.ts src/components/ArticleToc.astro "src/pages/blog/[...slug].astro" src/styles/global.css tests/reading.test.mjs tests/integration.mjs
git commit -m "feat: improve long-form article reading"
```

### Task 6: Editor Preview, Draft Preview, and Article Images

**Files:**
- Create: `src/pages/api/admin/preview.ts`
- Create: `src/pages/admin/preview.astro`
- Modify: `src/lib/uploads.ts`
- Modify: `src/pages/api/admin/uploads.ts`
- Modify: `src/pages/admin/editor.astro`
- Modify: `src/styles/global.css`
- Modify: `tests/integration.mjs`

**Interfaces:**
- Consumes: `renderMarkdownDocument()` from Task 5.
- Produces: `saveContentImage(file: File): Promise<string>`, `contentImageFilename(url: string): string | undefined`; retain old upload exports as compatibility aliases until all callers migrate.
- Produces: protected preview POST body `{ body: string }` and JSON `{ html: string }`.

- [ ] **Step 1: Add protected preview and upload integration tests**

Assert reader and anonymous requests receive 401, cross-origin admin requests receive 403, oversized preview bodies receive 413, scripts are removed, and a valid PNG upload URL can be embedded in rendered Markdown. Create draft post ID `42`, assert `/admin/preview/?id=42` redirects anonymous users, and assert it renders draft content for the administrator.

- [ ] **Step 2: Run integration tests and verify failure**

Run: `npm run build && npm run test:integration`

Expected: FAIL with missing preview route and missing draft preview page.

- [ ] **Step 3: Build the preview and safe editor state flow**

Generalize upload names without changing storage location or validation. Return distinct 413, 415, and 422 responses. The editor adds a preview pane, image picker, insertion button, and preview debounce of 300 ms. Insert `![图片说明](returned-url)` at `selectionStart` and restore textarea focus.

Set a `dirty` flag on `input` and `change`; clear it only after a successful save response. Register `beforeunload` only while dirty. Mobile buttons switch the editor and preview panels using `aria-selected` and the `hidden` attribute.

Draft preview looks up by numeric ID, requires administrator role, uses `no-store`, passes `robots="noindex, nofollow"`, and never creates a tokenized public URL.

- [ ] **Step 4: Verify editor failure states and existing project uploads**

Run: `npm run check && npm run build && npm run test:integration`

Expected: PASS; existing project upload and publish assertions remain green.

- [ ] **Step 5: Commit Task 6**

```bash
git add src/lib/uploads.ts src/pages/api/admin/uploads.ts src/pages/api/admin/preview.ts src/pages/admin/preview.astro src/pages/admin/editor.astro src/styles/global.css tests/integration.mjs
git commit -m "feat: add safe article preview and images"
```

### Task 7: Canonical Metadata, RSS, and Sitemap

**Files:**
- Create: `src/lib/seo.ts`
- Create: `src/pages/rss.xml.ts`
- Create: `src/pages/sitemap.xml.ts`
- Create: `tests/seo.test.mjs`
- Modify: `src/layouts/BaseLayout.astro`
- Modify: `src/pages/blog/[...slug].astro`
- Modify: `src/pages/blog/index.astro`
- Modify: `src/pages/projects/[...slug].astro`
- Modify: `src/pages/admin/index.astro`
- Modify: `src/pages/admin/editor.astro`
- Modify: `src/pages/admin/project-editor.astro`
- Modify: `src/pages/admin/settings.astro`
- Modify: `src/pages/admin/preview.astro`
- Modify: `src/pages/login.astro`
- Modify: `src/pages/register.astro`
- Modify: `tests/integration.mjs`

**Interfaces:**
- Produces: `absoluteUrl(path: string, requestUrl?: URL): string`, `escapeXml(value: string): string`, `serializeJsonLd(value: Record<string, unknown>): string`, and `articleJsonLd(post, canonical): Record<string, unknown>`.
- Extends `BaseLayout` props with `canonicalPath?: string`, `image?: string`, `pageType?: 'website' | 'article'`, `robots?: string`, `jsonLd?: Record<string, unknown>`.

- [ ] **Step 1: Write helper and endpoint tests**

Pin XML characters, paths containing non-ASCII tags, a title containing `</script>`, public-only feed items, absolute URLs, and exclusion of admin/auth/draft/scheduled/archived URLs:

```js
assert.equal(escapeXml(`A&B<"'`), 'A&amp;B&lt;&quot;&apos;');
assert.doesNotMatch(serializeJsonLd({ headline: '</script>' }), /<\/script>/i);
const rss = await (await get('/rss.xml')).text();
const sitemap = await (await get('/sitemap.xml')).text();
assert.doesNotMatch(rss, /private-draft/);
assert.doesNotMatch(sitemap, /\/admin\//);
```

- [ ] **Step 2: Run SEO tests and verify failure**

Run: `npm run test:unit -- --test-name-pattern="XML|canonical|JSON-LD"`

Expected: FAIL because `src/lib/seo.ts` is absent.

- [ ] **Step 3: Add metadata and machine-readable routes**

Generate canonical and Open Graph tags from `getPublicOrigin()`. Serialize JSON-LD with `JSON.stringify(value).replace(/</g, '\\u003c')`. Feed and sitemap routes call only Task 2 public queries and return `application/rss+xml; charset=utf-8` or `application/xml; charset=utf-8`.

Tag archive URLs use `encodeURIComponent(tag)`. Include homepage, about, blog list, projects list, public projects, public posts, and current public tag archives in the sitemap. Pass `noindex, nofollow` on admin, login, register, and draft preview pages.

- [ ] **Step 4: Run metadata and leak regression checks**

Run: `npm run check && npm run build && npm run test:unit && npm run test:integration`

Expected: PASS with no non-public slug in HTML metadata, feed, sitemap, or adjacent links.

- [ ] **Step 5: Commit Task 7**

```bash
git add src/lib/seo.ts src/pages/rss.xml.ts src/pages/sitemap.xml.ts src/layouts/BaseLayout.astro "src/pages/blog/[...slug].astro" src/pages/blog/index.astro "src/pages/projects/[...slug].astro" src/pages/admin/index.astro src/pages/admin/editor.astro src/pages/admin/project-editor.astro src/pages/admin/settings.astro src/pages/admin/preview.astro src/pages/login.astro src/pages/register.astro tests/seo.test.mjs tests/integration.mjs
git commit -m "feat: add blog metadata feeds and sitemap"
```

### Task 8: Production Start, Health, Backup, Headers, and Hero Optimization

**Files:**
- Create: `scripts/start.mjs`
- Create: `scripts/backup.mjs`
- Create: `scripts/optimize-assets.mjs`
- Create: `src/lib/health.ts`
- Create: `src/pages/api/health.ts`
- Create: `src/middleware.ts`
- Create: `tests/operations.test.mjs`
- Create: `public/archive-hero-v1.webp`
- Create: `deploy/personal-blog.service.example`
- Modify: `src/pages/index.astro`
- Modify: `src/config/site.ts`
- Modify: `astro.config.mjs`
- Modify: `package.json`
- Modify: `deploy/Caddyfile.example`
- Modify: `tests/integration.mjs`

**Interfaces:**
- Produces: `npm start` that sets `NODE_ENV=production` only when missing, then dynamically imports `dist/server/entry.mjs`.
- Produces: `npm run backup -- --output data/backups` with a unique timestamped directory.
- Produces: `checkHealth(db?: Pick<Database.Database, 'prepare'>): boolean` for an injectable database probe and `createHealthResponse(healthy: boolean): Response` for deterministic status output.
- Produces: `GET /api/health` returning `{ ok: true }` or `{ ok: false }` with status 503.

- [ ] **Step 1: Add operations tests before scripts**

Test production mode in a child process, health success and injected failure, security headers, and a backup made from a WAL database with one uploaded fixture. Set up the response and backup handles explicitly:

```js
const health = await get('/api/health');
const home = await get('/');
assert.equal(checkHealth({ prepare() { throw new Error('database unavailable'); } }), false);
assert.equal(createHealthResponse(false).status, 503);
assert.equal(health.status, 200);
assert.deepEqual(await health.json(), { ok: true });
assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
assert.equal(home.headers.get('x-frame-options'), 'DENY');
assert.ok(statSync('public/archive-hero-v1.webp').size < statSync('public/archive-hero-v1.png').size * 0.5);
const backupDb = new Database(generatedBackupDatabase, { readonly: true });
assert.equal(backupDb.prepare('SELECT title FROM posts WHERE slug = ?').get('backup-proof').title, '备份验证');
```

- [ ] **Step 2: Run operations tests and verify failure**

Run: `npm run test:unit -- --test-name-pattern="backup|health|production|hero"`

Expected: FAIL because operation scripts, middleware, health route, and WebP asset are absent.

- [ ] **Step 3: Implement deterministic production operations**

`scripts/start.mjs` uses:

```js
process.env.NODE_ENV ||= 'production';
await import('../dist/server/entry.mjs');
```

`scripts/backup.mjs` resolves the configured database and upload paths, creates `YYYY-MM-DDTHH-mm-ss-sssZ`, calls `await db.backup(destinationDatabase)`, recursively copies uploads, writes `manifest.json`, and removes only its newly created incomplete directory if an error occurs. It never deletes or replaces prior backups.

Add `sharp` as a direct dev dependency. `scripts/optimize-assets.mjs` reads the PNG and writes a deterministic compressed WebP at quality 82 while preserving dimensions. Add `optimize:assets` and update `start`/`backup` scripts in `package.json`. Use `<picture>` with WebP source, PNG fallback, width, and height on the homepage.

The health endpoint calls `createHealthResponse(checkHealth())`; the failure response contains only `{ ok: false }`. Middleware adds `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy: camera=(), microphone=(), geolocation=()`.

Set the adapter body size limit slightly above the 4 MB upload plus multipart overhead. The systemd example explicitly sets `NODE_ENV`, `HOST=127.0.0.1`, `PORT=4321`, public origin, database path, upload path, restart policy, and writable directory.

- [ ] **Step 4: Verify operations and production build**

Run: `npm run optimize:assets && npm run check && npm run build && npm run test:unit && npm run test:integration`

Expected: PASS; WebP is less than half the PNG size, health contains no filesystem details, and the backup opens independently.

- [ ] **Step 5: Commit Task 8**

```bash
git add package.json package-lock.json astro.config.mjs scripts/start.mjs scripts/backup.mjs scripts/optimize-assets.mjs src/lib/health.ts src/middleware.ts src/pages/api/health.ts src/pages/index.astro src/config/site.ts public/archive-hero-v1.webp deploy/personal-blog.service.example deploy/Caddyfile.example tests/operations.test.mjs tests/integration.mjs
git commit -m "feat: prepare reliable self hosting"
```

### Task 9: GitHub Documentation and End-to-End Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/deploy.md`
- Modify: `.env.example`

**Interfaces:**
- Consumes: all commands, routes, variables, and UI behavior delivered by Tasks 1–8.
- Produces: copyable quick-start, customization, administration, deployment, upgrade, backup, and restore instructions that match tested behavior.

- [ ] **Step 1: Add documentation assertions to the operations test**

Read README, deployment guide, package scripts, environment example, Caddy file, and systemd file. Assert every documented npm command exists, port `4321` is consistent, all runtime variables are documented, and README names every approved feature group. Parse the inputs before checking them:

```js
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const readme = readFileSync('README.md', 'utf8');
for (const command of ['dev', 'check', 'build', 'test:unit', 'test:integration', 'backup', 'start']) {
  assert.ok(packageJson.scripts[command], `README command must exist: ${command}`);
  assert.match(readme, new RegExp(`npm run ${command}|npm ${command}`));
}
```

- [ ] **Step 2: Run documentation assertions and verify failure**

Run: `npm run test:unit -- --test-name-pattern="documentation"`

Expected: FAIL because README and deployment docs do not yet describe the new commands and features.

- [ ] **Step 3: Rewrite README and deployment guide from tested behavior**

README order must be: overview, screenshots, features, requirements, quick start, centralized customization, administrator creation, writing workflow, visitor features, runtime controls, environment variables, tests, production deployment, backup/restore/upgrades, project structure, and Pokémon asset notice.

Deployment guide must contain exact Ubuntu directory preparation, Node install prerequisite, `npm ci`, build, administrator creation, environment file permissions, systemd install/start/status commands, Caddy validation/reload, health check, backup, upgrade, restore, and rollback steps. Explain that Astro does not automatically load runtime `.env` files and systemd supplies variables explicitly.

- [ ] **Step 4: Run the complete automated gate**

Run: `npm run check`

Expected: 0 errors, warnings, or hints.

Run: `npm run build`

Expected: standalone server build completes.

Run: `npm run test:unit`

Expected: all unit/operations/documentation tests pass.

Run: `npm run test:integration`

Expected: registration, authentication, permissions, public visibility, discovery, comments, likes, editor preview, uploads, SEO routes, health, and backup assertions pass.

- [ ] **Step 5: Perform browser verification at desktop and phone widths**

Start `npm run dev -- --host 127.0.0.1 --port 4330`. Verify homepage, blog search, tag archive, long article, editor, draft preview, settings, login, and registration. At desktop and 390 px phone widths confirm no horizontal overflow, keyboard-visible focus, labeled controls, preview tab behavior, collapsible contents, code copy status, and reduced-motion progress behavior.

- [ ] **Step 6: Commit documentation and final corrections**

```bash
git add README.md docs/deploy.md .env.example
git commit -m "docs: complete blog setup and operations guide"
```

- [ ] **Step 7: Request final whole-branch review**

Run: `git log --oneline --decorate -12` and `git diff HEAD~11..HEAD --stat`.

Expected: one design commit, one plan commit, and nine focused implementation commits with no unrelated files. Supply the spec, plan, test output, and browser observations to the reviewer. Address only concrete correctness, security, accessibility, data-preservation, and documentation findings, then rerun the complete automated gate.
