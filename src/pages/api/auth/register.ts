import type { APIRoute } from 'astro';
import { createSession, registerReader } from '../../../lib/auth';
import { consumeRateLimit } from '../../../lib/db';
import { isSameOrigin, readForm, seeOther } from '../../../lib/forms';

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  if (!consumeRateLimit(`register:${clientAddress}`, 5, 60 * 60 * 1000)) return seeOther('/register/?error=limited');
  try {
    const form = await readForm(request, 8_000);
    const username = (form.get('username') || '').trim();
    const password = form.get('password') || '';
    if (password !== form.get('confirm')) return seeOther('/register/?error=confirm');
    const viewer = await registerReader(username, password);
    createSession(cookies, viewer);
    return seeOther('/blog/');
  } catch (error) {
    if (error instanceof Error && error.message === 'username-taken') return seeOther('/register/?error=taken');
    return seeOther('/register/?error=invalid');
  }
};
