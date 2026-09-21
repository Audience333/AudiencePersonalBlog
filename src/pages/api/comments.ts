import type { APIRoute } from 'astro';
import { getViewer } from '../../lib/auth';
import { addComment, consumeRateLimit, findPostBySlug } from '../../lib/db';
import { isSameOrigin, readForm, seeOther } from '../../lib/forms';

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const viewer = getViewer(cookies);
  if (!viewer) return seeOther('/login/?error=required');
  try {
    const form = await readForm(request, 8_000);
    const slug = form.get('slug') || '';
    const post = findPostBySlug(slug);
    if (!post || post.status !== 'published') return new Response('Not found', { status: 404 });
    const body = (form.get('body') || '').trim();
    if (body.length < 2 || body.length > 1000) return seeOther(`/blog/${post.slug}/?comment=invalid#comments`);
    if (!consumeRateLimit(`comment:${viewer.id}`, 5, 10 * 60 * 1000)) return seeOther(`/blog/${post.slug}/?comment=limited#comments`);
    addComment(post.id, viewer.id, body);
    return seeOther(`/blog/${post.slug}/?comment=pending#comments`);
  } catch {
    return new Response('Invalid request', { status: 400 });
  }
};
