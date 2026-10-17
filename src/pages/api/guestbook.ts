import type { APIRoute } from 'astro';
import { getViewer } from '../../lib/auth';
import { addGuestbookEntry, consumeRateLimit, listApprovedGuestbook } from '../../lib/db';
import { isSameOrigin, readForm, seeOther } from '../../lib/forms';
import { isBlockedText } from '../../lib/moderation';

export const GET: APIRoute = () => {
  const entries = listApprovedGuestbook().map((entry) => ({
    nickname: entry.nickname,
    avatar: entry.avatar,
    body: entry.body,
    created_at: entry.created_at,
  }));
  return Response.json({ entries }, { headers: { 'Cache-Control': 'no-store' } });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  try {
    const form = await readForm(request, 4_000);
    const viewer = getViewer(cookies);
    const body = (form.get('body') || '').trim();
    if (body.length < 2 || body.length > 300) return seeOther('/guestbook/?post=invalid');
    let nickname = viewer?.username || (form.get('nickname') || '').trim() || '匿名用户';
    if (nickname.length > 16) nickname = nickname.slice(0, 16);
    if (isBlockedText(`${nickname} ${body}`)) {
      addGuestbookEntry(viewer?.id ?? null, nickname, body, 'rejected');
      return seeOther('/guestbook/?post=blocked');
    }
    const limitKey = viewer ? `guestbook:user:${viewer.id}` : 'guestbook:anonymous';
    if (!consumeRateLimit(limitKey, 3, 10 * 60 * 1000)) return seeOther('/guestbook/?post=limited');
    addGuestbookEntry(viewer?.id ?? null, nickname, body);
    return seeOther('/guestbook/?post=pending');
  } catch {
    return new Response('Invalid request', { status: 400 });
  }
};
