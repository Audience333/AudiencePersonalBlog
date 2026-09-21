import type { APIRoute } from 'astro';
import { authenticate, createSession, destroySession } from '../../../lib/auth';
import { consumeRateLimit } from '../../../lib/db';
import { isSameOrigin, readForm, seeOther } from '../../../lib/forms';

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  try {
    const form = await readForm(request, 8_000);
    const username = (form.get('username') || '').trim();
    const password = form.get('password') || '';
    if (!consumeRateLimit(`login:${username.toLowerCase()}`, 8, 15 * 60 * 1000)) return seeOther('/login/?error=limited');
    const viewer = await authenticate(username, password);
    if (!viewer) return seeOther('/login/?error=invalid');
    destroySession(cookies);
    createSession(cookies, viewer);
    return seeOther(viewer.role === 'admin' ? '/admin/' : '/blog/');
  } catch {
    return seeOther('/login/?error=invalid');
  }
};
