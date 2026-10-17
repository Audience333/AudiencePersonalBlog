import type { APIRoute } from 'astro';
import { getViewer } from '../../lib/auth';
import { addResource, consumeRateLimit } from '../../lib/db';
import { isSameOrigin, readForm, seeOther } from '../../lib/forms';
import { isBlockedText } from '../../lib/moderation';

// 登录访客投稿资源，管理员审核后公开
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const viewer = getViewer(cookies);
  if (!viewer) return seeOther('/login/?error=required');
  try {
    const form = await readForm(request, 8_000);
    const title = (form.get('title') || '').trim();
    const url = (form.get('url') || '').trim();
    const description = (form.get('description') || '').trim();
    const tags = (form.get('tags') || '').split(',').map((tag) => tag.trim()).filter(Boolean);
    if (title.length < 2 || title.length > 60) return seeOther('/resources/?submit=invalid');
    if (description.length > 200) return seeOther('/resources/?submit=invalid');
    if (tags.length > 4 || tags.some((tag) => tag.length > 12)) return seeOther('/resources/?submit=invalid');
    if (url && !['http:', 'https:'].includes(new URL(url).protocol)) return seeOther('/resources/?submit=invalid');
    if (isBlockedText(`${title} ${description} ${tags.join(' ')}`)) return seeOther('/resources/?submit=blocked');
    if (!consumeRateLimit(`resource:${viewer.id}`, 5, 10 * 60 * 1000)) return seeOther('/resources/?submit=limited');
    addResource({ title, url, description, tags_json: JSON.stringify(tags), submitter: viewer.username },
      viewer.role === 'admin' ? 'approved' : 'pending');
    return seeOther(`/resources/?submit=${viewer.role === 'admin' ? 'published' : 'pending'}`);
  } catch {
    return new Response('Invalid request', { status: 400 });
  }
};
