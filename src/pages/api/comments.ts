import type { APIRoute } from 'astro';
import { getViewer } from '../../lib/auth';
import { addComment, consumeRateLimit } from '../../lib/db';
import { isSameOrigin, readForm, seeOther } from '../../lib/forms';
import { findPublicPostBySlug } from '../../lib/posts';
import { getRuntimeSettings } from '../../lib/settings';

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const viewer = getViewer(cookies);
  if (!viewer) return seeOther('/login/?error=required');
  try {
    const form = await readForm(request, 8_000);
    const slug = form.get('slug') || '';
    const post = findPublicPostBySlug(slug);
    if (!post) return new Response('Not found', { status: 404 });
    if (post.comments_enabled !== 1) return seeOther(`/blog/${post.slug}/?comment=closed#comments`);
    const body = (form.get('body') || '').trim();
    if (body.length < 2 || body.length > 1000) return seeOther(`/blog/${post.slug}/?comment=invalid#comments`);
    const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase('zh-CN').replace(/\s+/g, ' ').trim();
    const normalizedBody = normalize(body);
    const isBlocked = getRuntimeSettings().blockedCommentKeywords
      .some((keyword) => normalizedBody.includes(normalize(keyword)));
    if (isBlocked) {
      addComment(post.id, viewer.id, body, 'rejected');
      return seeOther(`/blog/${post.slug}/?comment=blocked#comments`);
    }
    if (!consumeRateLimit(`comment:${viewer.id}`, 5, 10 * 60 * 1000)) return seeOther(`/blog/${post.slug}/?comment=limited#comments`);
    addComment(post.id, viewer.id, body);
    return seeOther(`/blog/${post.slug}/?comment=pending#comments`);
  } catch {
    return new Response('Invalid request', { status: 400 });
  }
};
