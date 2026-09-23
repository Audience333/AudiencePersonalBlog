import type { APIRoute } from 'astro';
import { getViewer } from '../../../lib/auth';
import { isSameOrigin, readForm } from '../../../lib/forms';
import { renderMarkdownDocument } from '../../../lib/reading';

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOrigin(request)) return Response.json({ error: '请求来源不正确。' }, { status: 403 });
  if (getViewer(cookies)?.role !== 'admin') return Response.json({ error: '请先以管理员身份登录。' }, { status: 401 });
  try {
    const form = await readForm(request, 128_000);
    const body = form.get('body') || '';
    return Response.json({ html: (await renderMarkdownDocument(body)).html }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof Error && error.message === 'body-too-large') return Response.json({ error: '预览内容过大。' }, { status: 413 });
    return Response.json({ error: '预览失败。' }, { status: 400 });
  }
};
