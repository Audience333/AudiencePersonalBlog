import type { APIRoute } from 'astro';
import { getViewer } from '../../lib/auth';
import { addDanmaku, consumeRateLimit, listApprovedDanmaku } from '../../lib/db';
import { isSameOrigin, readForm } from '../../lib/forms';
import { isBlockedText } from '../../lib/moderation';
import { findPublicPostBySlug } from '../../lib/posts';

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export const GET: APIRoute = ({ url }) => {
  const post = findPublicPostBySlug(url.searchParams.get('slug') || '');
  if (!post) return json({ error: '文章不存在。' }, 404);
  const items = listApprovedDanmaku(post.id).map((item) => ({ body: item.body, created_at: item.created_at }));
  return json({ items });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOrigin(request)) return json({ error: '请求来源不正确。' }, 403);
  const viewer = getViewer(cookies);
  if (!viewer) return json({ error: '请先登录。' }, 401);
  try {
    const form = await readForm(request, 2_000);
    const post = findPublicPostBySlug(form.get('slug') || '');
    if (!post) return json({ error: '文章不存在。' }, 404);
    const body = (form.get('body') || '').trim();
    if (body.length < 1 || body.length > 50) return json({ error: '弹幕需为 1–50 字。' }, 422);
    if (isBlockedText(body)) return json({ error: '弹幕未能通过发布规则。' }, 422);
    if (!consumeRateLimit(`danmaku:${viewer.id}`, 10, 10 * 60 * 1000)) return json({ error: '发送太频繁，请稍后再试。' }, 429);
    addDanmaku(post.id, viewer.id, viewer.username, body);
    return json({ ok: true });
  } catch {
    return json({ error: '请求无效。' }, 400);
  }
};
