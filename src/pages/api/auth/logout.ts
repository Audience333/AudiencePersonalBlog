import type { APIRoute } from 'astro';
import { destroySession } from '../../../lib/auth';
import { isSameOrigin, seeOther } from '../../../lib/forms';

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  destroySession(cookies);
  return seeOther('/');
};
