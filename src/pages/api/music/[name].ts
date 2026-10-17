import type { APIRoute } from 'astro';
import { readMusicFile } from '../../../lib/music';

// 支持 HTTP Range，播放器拖动进度条依赖它。
export const GET: APIRoute = ({ params, request }) => {
  const track = readMusicFile(params.name || '');
  if (!track) return new Response('Not found', { status: 404 });
  const size = track.bytes.length;
  const headers: Record<string, string> = {
    'Content-Type': track.type,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  };
  const match = request.headers.get('range')?.match(/^bytes=(\d+)-(\d*)$/);
  if (match) {
    const start = Number(match[1]);
    const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }
    return new Response(new Uint8Array(track.bytes.subarray(start, end + 1)), {
      status: 206,
      headers: {
        ...headers,
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Content-Length': String(end - start + 1),
      },
    });
  }
  return new Response(new Uint8Array(track.bytes), {
    headers: { ...headers, 'Content-Length': String(size) },
  });
};
