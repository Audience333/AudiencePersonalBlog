import { defineMiddleware } from 'astro:middleware';
import { getViewer } from './lib/auth';
import { isLikelyBot, recordPageView, shouldTrackPath } from './lib/analytics';

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // 自托管访问统计：只记录公开 HTML 页面，跳过后台、API、机器人和管理员本人。
  try {
    const pathname = context.url.pathname;
    const userAgent = context.request.headers.get('user-agent') || '';
    if (
      context.request.method === 'GET'
      && response.status === 200
      && (response.headers.get('content-type') || '').includes('text/html')
      && shouldTrackPath(pathname)
      && !isLikelyBot(userAgent)
      && getViewer(context.cookies)?.role !== 'admin'
    ) {
      recordPageView({
        path: pathname,
        referrer: context.request.headers.get('referer') || '',
        userAgent,
      });
    }
  } catch {
    // 统计失败不影响正常访问。
  }
  return response;
});
