import type { APIRoute } from 'astro';
import { getViewer } from '../../lib/auth';
import { consumeRateLimit, findPostBySlug, toggleLike } from '../../lib/db';
import { isSameOrigin, readForm, seeOther } from '../../lib/forms';

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const viewer = getViewer(cookies);
  if (!viewer) return seeOther('/login/?error=required');
  try {
    const form = await readForm(request, 4_000);
    const post = findPostBySlug(form.get('slug') || '');
    if (!post || post.status !== 'published') return new Response('Not found', { status: 404 });
    if (!consumeRateLimit(`like:${viewer.id}`, 30, 60 * 1000)) return seeOther(`/blog/${post.slug}/#reactions`);
    toggleLike(post.id, viewer.id);
    return seeOther(`/blog/${post.slug}/#reactions`);
  } catch {
    return new Response('Invalid request', { status: 400 });
  }
};
