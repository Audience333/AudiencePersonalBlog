import type { APIRoute } from 'astro';
import { getViewer } from '../../../lib/auth';
import { isSameOrigin } from '../../../lib/forms';
import { MAX_PROJECT_IMAGE_BYTES, saveContentImage } from '../../../lib/uploads';

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOrigin(request)) return json({ error: '请求来源不正确。' }, 403);
  const viewer = getViewer(cookies);
  if (viewer?.role !== 'admin') return json({ error: '请先以管理员身份登录。' }, 401);
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > MAX_PROJECT_IMAGE_BYTES + 64_000) return json({ error: '图片不能超过 4 MB。' }, 413);
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data')) return json({ error: '请使用图片上传表单。' }, 415);
  try {
    const form = await request.formData();
    const image = form.get('image');
    if (!image || typeof image === 'string') return json({ error: '请选择一张图片。' }, 422);
    const url = await saveContentImage(image);
    return json({ ok: true, url });
  } catch {
    return json({ error: '仅支持不超过 4 MB 的 PNG、JPG、WebP 或 GIF 图片。' }, 422);
  }
};
