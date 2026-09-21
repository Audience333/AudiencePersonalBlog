import type { APIRoute } from 'astro';
import { getViewer } from '../../../lib/auth';
import { findProjectById, saveProject } from '../../../lib/db';
import { isSameOrigin, readForm } from '../../../lib/forms';
import { coverFilename } from '../../../lib/uploads';

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
    const year = Number(form.get('year') || 0);
    const tools = (form.get('tools') || '').split(',').map((tool) => tool.trim()).filter(Boolean);
    const featured = form.get('featured') === 'on' ? 1 : 0;
    const coverImage = (form.get('cover_image') || '').trim();
    const status = form.get('status') === 'published' ? 'published' : 'draft';
    if (id && (!Number.isSafeInteger(id) || !findProjectById(id))) return json({ error: '作品不存在。' }, 404);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) return json({ error: '网址标识只能使用小写英文字母、数字和连字符。' }, 422);
    if (title.length < 2 || title.length > 100 || description.length < 5 || description.length > 240) return json({ error: '请检查标题和简介长度。' }, 422);
    if (body.length < 2 || body.length > 100_000) return json({ error: '作品正文长度需为 2–100000 字。' }, 422);
    if (!Number.isInteger(year) || year < 1900 || year > 2100) return json({ error: '年份需在 1900–2100 之间。' }, 422);
    if (tools.length > 10 || tools.some((tool) => tool.length > 30)) return json({ error: '最多填写 10 个工具，每个不超过 30 字。' }, 422);
    if (coverImage && !coverFilename(coverImage)) return json({ error: '封面图片地址不正确。' }, 422);
    const savedId = saveProject({
      slug, title, description, body_markdown: body, tools_json: JSON.stringify(tools), year, featured,
      cover_image: coverImage || null, status,
    }, id || undefined);
    return json({ ok: true, location: `/admin/project-editor/?id=${savedId}` });
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE')) return json({ error: '这个网址标识已被其他作品使用。' }, 409);
    return json({ error: '保存失败，请稍后重试。' }, 500);
  }
};
