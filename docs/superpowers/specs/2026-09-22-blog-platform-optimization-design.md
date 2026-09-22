# Personal Blog Optimization Design

Date: 2026-09-22

Status: Awaiting written-spec review

Project: Archive Portfolio Blog

## 1. Purpose

Improve the existing Astro and SQLite portfolio blog into a maintainable personal publishing template that can later run on a small self-hosted server. The work must preserve the current archive visual style, existing accounts and content, and the single-process deployment model.

The finished template should let a new GitHub user customize the site in one place, create and preview articles from the browser, help readers find and navigate writing, expose standard feeds and metadata, and operate the site with documented backup and recovery procedures.

## 2. Approved Scope

The approved scope contains all seven proposed feature groups:

1. Production readiness and performance.
2. Centralized template configuration.
3. Search, tags, and pagination.
4. Reading experience improvements.
5. Browser-based writing improvements.
6. SEO, RSS, and sitemap support.
7. Publishing and interaction controls.

README and deployment documentation must be updated with every implemented capability.

## 3. Constraints and Non-Goals

- Keep Astro 7, the Node standalone adapter, TypeScript, and SQLite.
- Keep the frontend, backend routes, administration pages, and database in one repository and one application process.
- Preserve existing users, sessions, posts, projects, comments, likes, and uploaded project covers.
- Support an inexpensive Linux server with persistent local storage and an HTTPS reverse proxy.
- Keep the current archive theme and responsive behavior.
- Do not introduce a separate search service, external CMS, mail service, object storage service, or frontend framework.
- Do not implement automatic editor saves, revision history, email subscriptions, public draft links, or a general media library in this phase.
- Do not add a strict Content Security Policy in this phase because the current layout contains inline theme code. Other baseline security headers remain in scope.

## 4. Architecture

The project remains a single Astro Node application. Server-rendered pages call repository functions in `src/lib/`, API routes handle mutations, and SQLite remains the authoritative store for dynamic content.

New responsibilities are separated into focused modules:

- `src/config/site.ts`: version-controlled identity, public URL, timezone, pagination size, social links, and default sharing image.
- `src/lib/migrations.ts`: ordered, transactional database schema migrations.
- `src/lib/posts.ts` or focused additions to the existing database layer: public post discovery, search, tag filtering, scheduling, and adjacent-post queries.
- `src/lib/settings.ts`: typed runtime settings stored in the existing settings table.
- `src/lib/seo.ts`: canonical URLs, sharing metadata, and structured article data.
- `src/lib/reading.ts`: reading-time and heading metadata helpers.
- `scripts/start.mjs`: cross-platform production entry point.
- `scripts/backup.mjs`: consistent SQLite and upload backup creation.

Large existing files should only be split where a new responsibility would otherwise make them harder to understand. Unrelated refactoring is out of scope.

## 5. Configuration

Static template identity belongs in one typed configuration object:

- site name
- author display name
- description
- public site URL fallback
- timezone, default `Asia/Shanghai`
- posts per page, default `10`
- social profile links
- default Open Graph image
- footer text

`PUBLIC_SITE_ORIGIN` remains the production override for the public origin and same-origin form checks. A committed `.env.example` documents runtime variables without containing secrets.

Controls that an administrator may change while the server is running are stored in SQLite:

- `registration_open`, default `true`
- `blocked_comment_keywords`, default empty
- optional default for comments on newly created posts, default `true`

An administrator settings page updates these values. Settings reads use typed defaults so a missing row does not break the site.

## 6. Database Evolution

The current create-if-missing schema initialization is replaced or augmented with ordered migrations tracked by SQLite `PRAGMA user_version`. Each migration runs inside a transaction and is safe to skip after successful application.

Existing data is never deleted or recreated during migration. Integration tests must start from a copy of the previous schema and prove that old posts, projects, users, and comments remain accessible.

Posts gain the following concepts:

- `scheduled_at`: nullable UTC timestamp. A published post with a future value is not public until that time.
- `archived`: integer boolean, default `0`. Archived posts are hidden from public discovery and direct public access.
- `comments_enabled`: integer boolean, default `1`.
- `cover_image`: nullable local upload URL or approved HTTP(S) URL.

The existing `published_at` date remains for display and ordering compatibility. `scheduled_at` controls the precise release time. Existing published posts receive no schedule and remain publicly visible.

Public post queries always enforce all of these rules:

- status is `published`
- archived is false
- scheduled time is absent or no later than the current time

Search covers title, description, Markdown body, and tags. The expected personal-blog data volume does not justify a separate index or service. SQLite `LIKE` queries and JSON tag inspection are sufficient for this phase. All search and navigation queries use the same public visibility predicate so drafts cannot leak through results, tag pages, feeds, or adjacent-post links.

## 7. Visitor Pages

### Blog discovery

`/blog/` accepts validated `q`, `tag`, and `page` parameters. Invalid pages fall back to page 1. Empty queries show the normal chronological list. Search and tag filters preserve each other while paging.

Tags displayed on list and article pages become links. A tag archive has a stable, encoded URL under `/blog/tags/<tag>/`. Pagination exposes previous and next links with accessible labels.

### Article reading

Article pages display:

- calculated reading time
- a table of contents generated from level 2 and level 3 Markdown headings
- stable heading IDs
- a subtle reading progress indicator
- copy buttons for code blocks
- previous and next public articles

The table of contents is omitted when an article has fewer than two qualifying headings. On narrow screens it becomes a collapsible section above the article instead of a fixed side panel. Copy actions have a visible success or failure state and do not prevent ordinary text selection.

When comments are disabled, approved historical comments stay visible and the submission form is replaced with an explanatory message.

## 8. Administration Experience

### Article editor

The existing editor gains:

- desktop split view with Markdown input and rendered preview
- mobile edit/preview tabs
- a dirty-state indicator after any field changes
- a browser leave warning while unsaved changes exist
- an administrator-only draft preview page
- article image upload with insertion of Markdown syntax at the cursor
- schedule date and time controls
- archive and per-post comment controls
- optional cover image

Preview rendering uses the same Markdown parsing and sanitization path as the public article. A protected preview API accepts a bounded request body and returns sanitized HTML. Draft preview pages require an authenticated administrator session and send `Cache-Control: no-store` plus `noindex` metadata.

Image uploads reuse the existing validation rules: authenticated administrator only, same-origin request, recognized PNG/JPEG/WebP/GIF signatures, randomized filenames, and a 4 MB limit. The storage helper becomes content-neutral so project and article uploads share one safe implementation.

### Runtime settings

The admin dashboard links to a settings page for registration status, the default comment setting, and blocked comment keywords. Closing registration affects only new registrations; existing accounts continue to authenticate.

Blocked keyword matching is case-insensitive after whitespace normalization. A matching submission is stored as rejected for auditability and is never shown publicly. Non-matching comments retain the existing pending-review flow.

## 9. Publishing Rules

The editor displays four meaningful states without expanding the existing status constraint:

- Draft: status is draft.
- Scheduled: status is published and `scheduled_at` is in the future.
- Published: status is published and the schedule is absent or due.
- Archived: `archived` is true.

Scheduling uses the configured site timezone in the editor and stores UTC in SQLite. The admin list shows the resolved state and local publish time. A scheduled article becomes visible through ordinary request-time checks; no background worker or cron job is required.

## 10. SEO and Syndication

The base layout accepts canonical URL, page type, sharing image, and robots directives. Public pages receive canonical links and Open Graph metadata. Article pages also receive `BlogPosting` JSON-LD with headline, description, author, publication date, canonical URL, and image when available.

The following server routes are added:

- `/rss.xml`: current public posts with canonical absolute links.
- `/sitemap.xml`: public static pages, projects, articles, and tag archives.

Admin, authentication, registration, preview, API, draft, scheduled, and archived resources never appear in feeds or the sitemap. Admin and authentication pages emit `noindex, nofollow`.

Production builds require a valid public origin for canonical output. Development may fall back to the request origin.

## 11. Production Operation

`npm start` calls a small Node script that sets `NODE_ENV=production` when it is absent and then loads the Astro standalone entry point. This is cross-platform and ensures production cookies receive the `Secure` flag when served through HTTPS.

The production process reads:

- `HOST`, expected `127.0.0.1` behind Caddy
- `PORT`, documented consistently with the Caddy example
- `PUBLIC_SITE_ORIGIN`
- `BLOG_DB_PATH`
- `BLOG_UPLOAD_DIR`
- optional backup output directory

Astro's Node adapter does not load environment files automatically. Documentation therefore shows explicit service environment configuration rather than implying `.env.production` is read at runtime.

`GET /api/health` runs a lightweight database query. It returns a minimal success response or HTTP 503 without paths, stack traces, or account information.

The backup command uses the SQLite backup API to create a consistent timestamped database copy, then copies uploaded media into the same backup directory. It exits nonzero on failure and never silently replaces an existing backup. Restore instructions require stopping the application before replacing data.

Deployment examples include:

- an Ubuntu systemd service
- a Caddy reverse proxy with HTTPS and compression
- persistent data directory ownership
- initial administrator creation
- upgrade sequence: back up, install, build, restart, verify health
- restore and rollback guidance

The application adds baseline response headers for frame denial, MIME sniffing protection, referrer control, and disabling unused camera, microphone, and geolocation permissions.

## 12. Performance and Assets

The existing archive hero PNG remains available as the source asset. A compressed WebP derivative is generated and used by the homepage with an appropriate fallback. Dimensions are declared to reduce layout movement. The goal is a material reduction from the current roughly 1.69 MB hero transfer without visible degradation at normal desktop size.

Uploaded article and project images keep their existing originals in this phase. Automatic thumbnail generation is outside scope.

## 13. Error Handling

- Invalid public search and pagination input falls back to safe defaults.
- Unauthorized preview, settings, and upload requests return 401 or 403 without content disclosure.
- Editor save and preview failures show actionable inline messages and keep local form content intact.
- Upload errors distinguish unsupported type, excessive size, and network failure without revealing server paths.
- Database migrations fail the startup process before serving requests and report the migration number.
- Backup failures exit nonzero and identify the failed stage.
- Feed and sitemap generation reuse public query rules; malformed stored optional metadata falls back rather than breaking the full response.

## 14. Testing and Verification

Automated coverage extends the existing integration suite with meaningful behavior checks:

- migration from a fixture representing the old database schema
- preservation of existing records after migration
- draft, archived, and future-scheduled posts excluded from every public path
- due scheduled posts becoming visible without a worker
- combined search, tag, and pagination behavior
- no draft leakage through RSS, sitemap, or adjacent links
- registration toggle behavior
- per-post comment toggle and blocked-keyword rejection
- admin authorization for settings, preview, and article upload
- Markdown preview sanitization matching published output
- canonical, Open Graph, JSON-LD, RSS, sitemap, and robots output
- health endpoint success and database-failure response
- backup output creation with database and uploaded files

Project gates remain:

- `npm run check`
- `npm run build`
- `npm run test:integration`

Browser verification covers the blog list, long article, editor, settings page, and responsive layouts at desktop and phone widths. Accessibility checks include keyboard navigation, visible focus, correctly labeled controls, status announcements, and reduced-motion behavior for the progress indicator.

## 15. Documentation Deliverables

README is rewritten around the GitHub template user's workflow:

1. Feature overview and screenshots.
2. Requirements and quick start.
3. Single-file site customization.
4. Administrator creation and browser workflows.
5. Runtime settings and feature behavior.
6. Environment variables.
7. Testing.
8. Production deployment.
9. Backup, restore, and upgrades.
10. Third-party Pokémon asset notice and replacement guidance.

Detailed Linux service and Caddy instructions stay in `docs/deploy.md`. Configuration examples and README commands must match the actual package scripts and tested ports.

## 16. Implementation Order

The implementation plan should divide work into reviewable stages:

1. Configuration and database migrations.
2. Public post query rules, scheduling, archive, and comment controls.
3. Search, tags, pagination, and reading metadata.
4. Editor preview, draft preview, and article uploads.
5. SEO, RSS, sitemap, and structured metadata.
6. Runtime settings and moderation controls.
7. Production start, health, backup, headers, and asset optimization.
8. Full documentation, regression testing, and browser verification.

Each stage must keep the application buildable and preserve existing user data.

## 17. Acceptance Criteria

The design is complete when the implemented site satisfies all approved feature groups, existing data upgrades automatically, public discovery never exposes non-public posts, GitHub users can customize identity from one configuration file, administrators can safely preview and manage publishing from the browser, standard feed and metadata endpoints validate, backup and recovery are documented and tested, and the complete verification suite passes.
