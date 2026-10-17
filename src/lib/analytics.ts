import { getDb } from './db.ts';

export interface PageViewInput {
  path: string;
  referrer?: string;
  userAgent?: string;
}

export interface AnalyticsSummary {
  days: number;
  totalViews: number;
  todayViews: number;
  perDay: Array<{ day: string; views: number }>;
  topPages: Array<{ path: string; views: number }>;
  topReferrers: Array<{ referrer: string; views: number }>;
}

const BOT_PATTERN = /bot|crawler|spider|slurp|preview|curl|wget|httpclient/i;

export function isLikelyBot(userAgent: string): boolean {
  return BOT_PATTERN.test(userAgent);
}

export function shouldTrackPath(pathname: string): boolean {
  if (pathname.startsWith('/api/') || pathname.startsWith('/admin')) return false;
  // 只记录 HTML 页面，跳过带扩展名的静态资源。
  return !/\.[a-z0-9]{1,8}$/i.test(pathname);
}

export function recordPageView(input: PageViewInput): void {
  getDb().prepare('INSERT INTO page_views (path, referrer, user_agent, created_at) VALUES (?, ?, ?, ?)')
    .run(input.path.slice(0, 200), (input.referrer || '').slice(0, 300), (input.userAgent || '').slice(0, 200), Date.now());
}

export function getAnalyticsSummary(days = 30): AnalyticsSummary {
  const db = getDb();
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const totalViews = (db.prepare('SELECT COUNT(*) AS count FROM page_views WHERE created_at >= ?').get(since) as { count: number }).count;
  const todayViews = (db.prepare('SELECT COUNT(*) AS count FROM page_views WHERE created_at >= ?').get(todayStart.getTime()) as { count: number }).count;

  const perDayRows = db.prepare(`
    SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch', 'localtime') AS day, COUNT(*) AS views
    FROM page_views WHERE created_at >= ? GROUP BY day ORDER BY day ASC
  `).all(since) as Array<{ day: string; views: number }>;
  // 补齐没有访问的日期，让柱状图连续。
  const byDay = new Map(perDayRows.map((row) => [row.day, row.views]));
  const perDay: Array<{ day: string; views: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    perDay.push({ day: key, views: byDay.get(key) ?? 0 });
  }

  const topPages = db.prepare(`
    SELECT path, COUNT(*) AS views FROM page_views WHERE created_at >= ?
    GROUP BY path ORDER BY views DESC, path ASC LIMIT 10
  `).all(since) as Array<{ path: string; views: number }>;

  const topReferrers = db.prepare(`
    SELECT referrer, COUNT(*) AS views FROM page_views
    WHERE created_at >= ? AND referrer != ''
    GROUP BY referrer ORDER BY views DESC, referrer ASC LIMIT 10
  `).all(since) as Array<{ referrer: string; views: number }>;

  return { days, totalViews, todayViews, perDay, topPages, topReferrers };
}
