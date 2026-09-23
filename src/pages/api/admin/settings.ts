import type { APIRoute } from 'astro';
import { getViewer } from '../../../lib/auth';
import { isSameOrigin, readForm } from '../../../lib/forms';
import { updateRuntimeSettings } from '../../../lib/settings';

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOrigin(request)) return json({ error: '请求来源不正确。' }, 403);
  if (getViewer(cookies)?.role !== 'admin') return json({ error: '请先以管理员身份登录。' }, 401);

  try {
    const form = await readForm(request, 16_000);
    const blockedCommentKeywords = (form.get('blocked_comment_keywords') || '')
      .split(/\r?\n/)
      .map((keyword) => keyword.trim())
      .filter(Boolean);
    const settings = updateRuntimeSettings({
      registrationOpen: form.get('registration_open') === 'on',
      defaultCommentsEnabled: form.get('default_comments_enabled') === 'on',
      blockedCommentKeywords,
    });
    return json({ ok: true, settings });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : '设置保存失败。' }, 422);
  }
};
