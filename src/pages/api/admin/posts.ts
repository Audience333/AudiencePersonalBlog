import type { APIRoute } from 'astro';
import { getViewer } from '../../../lib/auth';
import { findPostById, savePost } from '../../../lib/db';
import { isSameOrigin, readForm } from '../../../lib/forms';
import { coverFilename } from '../../../lib/uploads';
import { getRuntimeSettings } from '../../../lib/settings';
import { parseZonedDateTime } from '../../../lib/time';
import { siteConfig } from '../../../config/site';

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOrigin(request)) return json({ error: '请求来源不正确。' }, 403);
  const viewer = getViewer(cookies);
  if (viewer?.role !== 'admin') return json({ error: '请先以管理员身份登录。' }, 401);
  try {
    const form = await readForm(request);
    const id = Number(form.get('id') || 0);
    const slug = (form.get('slug') || '').trim();
    const title = (form.get('title') || '').trim();
    const description = (form.get('description') || '').trim();
    const body = (form.get('body') || '').trim();
    const publishedAt = (form.get('published_at') || '').trim();
    const scheduledValue = (form.get('scheduled_at') || '').trim();
    const archived: 0 | 1 = form.get('archived') === 'on' ? 1 : 0;
    const commentsEnabled: 0 | 1 = form.get('comments_enabled') === 'on' ? 1 : 0;
    const coverImage = (form.get('cover_image') || '').trim();
    const status = form.get('status') === 'published' ? 'published' : 'draft';
    const tags = (form.get('tags') || '').split(',').map((tag) => tag.trim()).filter(Boolean);
    if (id && (!Number.isSafeInteger(id) || !findPostById(id))) return json({ error: '文章不存在。' }, 404);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) return json({ error: '网址标识只能使用小写英文字母、数字和连字符。' }, 422);
    if (title.length < 2 || title.length > 100 || description.length < 5 || description.length > 240) return json({ error: '请检查标题和简介长度。' }, 422);
    if (body.length < 2 || body.length > 100_000) return json({ error: '正文长度需为 2–100000 字。' }, 422);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(publishedAt) || Number.isNaN(Date.parse(`${publishedAt}T00:00:00Z`))) return json({ error: '发布日期无效。' }, 422);
    if (tags.length > 8 || tags.some((tag) => tag.length > 20)) return json({ error: '最多填写 8 个标签，每个不超过 20 字。' }, 422);
    const scheduledAt = scheduledValue ? parseZonedDateTime(scheduledValue, siteConfig.timezone) : null;
    if (scheduledValue && scheduledAt === undefined) return json({ error: '计划发布时间无效。' }, 422);
    let validCoverImage: string | null = null;
    if (coverImage) {
      try {
        if (coverFilename(coverImage)) validCoverImage = coverImage;
        else if (['http:', 'https:'].includes(new URL(coverImage).protocol)) validCoverImage = coverImage;
        else return json({ error: '封面图片地址无效。' }, 422);
      } catch {
        return json({ error: '封面图片地址无效。' }, 422);
      }
    }
    const defaults = getRuntimeSettings();
    const effectiveCommentsEnabled: 0 | 1 = form.has('comments_enabled')
      ? commentsEnabled
      : (defaults.defaultCommentsEnabled ? 1 : 0);
    const savedId = savePost({
      slug, title, description, body_markdown: body, tags_json: JSON.stringify(tags), status, published_at: publishedAt,
      scheduled_at: scheduledAt, archived, comments_enabled: effectiveCommentsEnabled,
      cover_image: validCoverImage,
    }, id || undefined);
    return json({ ok: true, location: `/admin/editor/?id=${savedId}` });
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE')) return json({ error: '这个网址标识已被其他文章使用。' }, 409);
    return json({ error: '保存失败，请稍后重试。' }, 500);
  }
};
