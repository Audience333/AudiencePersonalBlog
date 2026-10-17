import type Database from 'better-sqlite3';
import { getDb, type PostRow } from './db.ts';

export type PublicPostSort = 'new' | 'hot' | 'words';

export type PublicPostFilters = {
  q?: string;
  tag?: string;
  page?: number;
  pageSize?: number;
  sort?: PublicPostSort;
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

function likeSearchRows(db: Database.Database, now: number, search: string): PostRow[] {
  const escaped = search.replace(/[\\%_]/g, '\\$&');
  return db.prepare(`
    SELECT * FROM posts
    WHERE ${PUBLIC_WHERE}
      AND (title LIKE @search ESCAPE '\\' OR description LIKE @search ESCAPE '\\' OR body_markdown LIKE @search ESCAPE '\\')
    ORDER BY published_at DESC, id DESC
  `).all({ now, search: `%${escaped}%` }) as PostRow[];
}

function ftsSearchRows(db: Database.Database, now: number, search: string): PostRow[] {
  const tokens = search.split(/\s+/).filter(Boolean).map((token) => `"${token.replace(/"/g, '')}"`);
  if (!tokens.length) return [];
  // trigram 分词要求每个词至少 3 个字符，短词回退到 LIKE。
  if (tokens.some((token) => token.length - 2 < 3)) return likeSearchRows(db, now, search);
  const rows = db.prepare(`
    SELECT * FROM posts
    WHERE ${PUBLIC_WHERE}
      AND id IN (SELECT rowid FROM posts_fts WHERE posts_fts MATCH @match)
    ORDER BY published_at DESC, id DESC
  `).all({ now, match: tokens.join(' AND ') }) as PostRow[];
  // trigram 对标点或极短片段可能查不到，空结果时回退 LIKE 保证召回。
  return rows.length ? rows : likeSearchRows(db, now, search);
}

function publicRows(now: number, query: string | undefined, db: Database.Database): PostRow[] {
  const search = query?.trim();
  if (!search) {
    return db.prepare(`SELECT * FROM posts WHERE ${PUBLIC_WHERE} ORDER BY published_at DESC, id DESC`)
      .all({ now }) as PostRow[];
  }
  try {
    return ftsSearchRows(db, now, search);
  } catch {
    // FTS 表缺失或查询语法异常时回退到 LIKE，保证搜索永远可用。
    return likeSearchRows(db, now, search);
  }
}

export function listAllPublicPosts(now = Date.now(), db?: Database.Database): PostRow[] {
  return publicRows(now, undefined, publicDatabase(db));
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
  if (filters.sort === 'hot') visible.sort((a, b) => b.view_count - a.view_count || b.published_at.localeCompare(a.published_at));
  else if (filters.sort === 'words') visible.sort((a, b) => countPostWords(b.body_markdown) - countPostWords(a.body_markdown));
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

// 卡片统计：字数（CJK 按字、英文按词）与配图数
export function countPostWords(markdown: string): number {
  const withoutCode = markdown.replace(/```[\s\S]*?```|`[^`]*`/g, '');
  const cjk = (withoutCode.match(/[㐀-鿿]/g) ?? []).length;
  const latin = withoutCode.replace(/[㐀-鿿]/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  return cjk + latin;
}

export function countPostImages(markdown: string): number {
  return (markdown.match(/!\[[^\]]*\]\(/g) ?? []).length;
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

export function findRelatedPublicPosts(
  post: PostRow,
  limit = 3,
  now = Date.now(),
  db?: Database.Database,
): PostRow[] {
  const tags = new Set(parsePostTags(post.tags_json));
  return publicRows(now, undefined, publicDatabase(db))
    .filter((candidate) => candidate.id !== post.id)
    .map((candidate) => ({
      candidate,
      score: parsePostTags(candidate.tags_json).filter((tag) => tags.has(tag)).length,
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || right.candidate.published_at.localeCompare(left.candidate.published_at))
    .slice(0, limit)
    .map(({ candidate }) => candidate);
}

export function listPublicSeriesPosts(
  series: string,
  now = Date.now(),
  db?: Database.Database,
): PostRow[] {
  return publicDatabase(db)
    .prepare(`SELECT * FROM posts WHERE series = @series AND ${PUBLIC_WHERE}
      ORDER BY series_order ASC, published_at ASC, id ASC`)
    .all({ series, now }) as PostRow[];
}
