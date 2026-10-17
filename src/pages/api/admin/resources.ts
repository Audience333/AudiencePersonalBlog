import type { APIRoute } from 'astro';
import { getViewer } from '../../../lib/auth';
import { setResourceRecommended, setResourceStatus } from '../../../lib/db';
import { isSameOrigin, readForm, seeOther } from '../../../lib/forms';

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  if (getViewer(cookies)?.role !== 'admin') return seeOther('/login/?error=required');
  try {
    const form = await readForm(request, 4_000);
    const id = Number(form.get('id'));
    if (!Number.isSafeInteger(id) || id <= 0) return new Response('Invalid request', { status: 400 });
    const action = form.get('action');
    if (action === 'approved' || action === 'rejected') setResourceStatus(id, action);
    else if (action === 'recommend') { setResourceStatus(id, 'approved'); setResourceRecommended(id, 1); }
    else if (action === 'unrecommend') setResourceRecommended(id, 0);
    else return new Response('Invalid request', { status: 400 });
    return seeOther('/admin/#resources');
  } catch {
    return new Response('Invalid request', { status: 400 });
  }
};
