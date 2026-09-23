import type Database from 'better-sqlite3';
import { getDb, type PostRow } from './db.ts';

export type PublicPostFilters = {
  q?: string;
  tag?: string;
  page?: number;
  pageSize?: number;
};

export type PostPage = {
  items: PostRow[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

export const PUBLIC_WHERE = `
  status = 'published'
  AND archived = 0
  AND (scheduled_at IS NULL OR scheduled_at <= @now)
`;

function publicDatabase(db?: Database.Database) {
  return db ?? getDb();
}

export function parsePostTags(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === 'string')
      : [];
  } catch {
    return [];
  }
}

function normalizedPageSize(value?: number) {
  if (!Number.isFinite(value)) return 10;
  return Math.min(50, Math.max(1, Math.floor(value!)));
}

function normalizedPage(value?: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.floor(value!));
}

function publicRows(now: number, query: string | undefined, db: Database.Database): PostRow[] {
  const search = query?.trim();
  if (!search) {
    return db.prepare(`SELECT * FROM posts WHERE ${PUBLIC_WHERE} ORDER BY published_at DESC, id DESC`)
      .all({ now }) as PostRow[];
  }

  const escaped = search.replace(/[\\%_]/g, '\\$&');
  return db.prepare(`
    SELECT * FROM posts
    WHERE ${PUBLIC_WHERE}
      AND (title LIKE @search ESCAPE '\\' OR description LIKE @search ESCAPE '\\' OR body_markdown LIKE @search ESCAPE '\\')
    ORDER BY published_at DESC, id DESC
  `).all({ now, search: `%${escaped}%` }) as PostRow[];
}

export function resolvePostState(post: PostRow, now = Date.now()): 'draft' | 'scheduled' | 'published' | 'archived' {
  if (post.archived === 1) return 'archived';
  if (post.status === 'draft') return 'draft';
  if (post.scheduled_at !== null && post.scheduled_at > now) return 'scheduled';
  return 'published';
}

export function listPublicPosts(
  filters: PublicPostFilters = {},
  now = Date.now(),
  db?: Database.Database,
): PostPage {
  const connection = publicDatabase(db);
  const requestedPage = normalizedPage(filters.page);
  const pageSize = normalizedPageSize(filters.pageSize);
  const tag = filters.tag?.trim();
  const visible = publicRows(now, filters.q, connection)
    .filter((post) => !tag || parsePostTags(post.tags_json).includes(tag));
  const totalItems = visible.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * pageSize;

  return {
    items: visible.slice(offset, offset + pageSize),
    page,
    pageSize,
    totalItems,
    totalPages,
  };
}

export function findPublicPostBySlug(slug: string, now = Date.now(), db?: Database.Database): PostRow | undefined {
  return publicDatabase(db).prepare(`SELECT * FROM posts WHERE slug = @slug AND ${PUBLIC_WHERE}`)
    .get({ slug, now }) as PostRow | undefined;
}

export function findAdjacentPublicPosts(
  id: number,
  now = Date.now(),
  db?: Database.Database,
): { previous?: PostRow; next?: PostRow } {
  const rows = publicRows(now, undefined, publicDatabase(db));
  const index = rows.findIndex((post) => post.id === id);
  if (index === -1) return {};
  return { previous: rows[index + 1], next: rows[index - 1] };
}

export function listPublicTags(now = Date.now(), db?: Database.Database): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const post of publicRows(now, undefined, publicDatabase(db))) {
    for (const tag of parsePostTags(post.tags_json)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((left, right) => left.tag.localeCompare(right.tag, 'zh-CN'));
}
