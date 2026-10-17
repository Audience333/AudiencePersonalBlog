import type { APIRoute } from 'astro';
import { getViewer } from '../../../lib/auth';
import { deleteDanmaku } from '../../../lib/db';
import { isSameOrigin, readForm, seeOther } from '../../../lib/forms';

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  if (getViewer(cookies)?.role !== 'admin') return seeOther('/login/?error=required');
  try {
    const form = await readForm(request, 4_000);
    const id = Number(form.get('id'));
    if (Number.isSafeInteger(id) && id > 0) deleteDanmaku(id);
    return seeOther('/admin/#danmaku');
  } catch {
    return new Response('Invalid request', { status: 400 });
  }
};
