import type { APIRoute } from 'astro';
import { getViewer } from '../../../lib/auth';
import { addUpdate, deleteUpdate } from '../../../lib/db';
import { isSameOrigin, readForm, seeOther } from '../../../lib/forms';

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  if (getViewer(cookies)?.role !== 'admin') return seeOther('/login/?error=required');
  try {
    const form = await readForm(request, 8_000);
    const action = form.get('action') || 'add';
    if (action === 'delete') {
      const id = Number(form.get('id'));
      if (Number.isSafeInteger(id) && id > 0) deleteUpdate(id);
      return seeOther('/admin/#updates');
    }
    const kind = form.get('kind') === 'tech' ? 'tech' : 'site';
    const body = (form.get('body') || '').trim();
    if (body.length < 2 || body.length > 2000) return new Response('Invalid request', { status: 400 });
    addUpdate(kind, body);
    return seeOther('/admin/#updates');
  } catch {
    return new Response('Invalid request', { status: 400 });
  }
};
