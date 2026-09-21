import type { APIRoute } from 'astro';
import { readProjectCover } from '../../../lib/uploads';

export const GET: APIRoute = ({ params }) => {
  const image = readProjectCover(params.name || '');
  if (!image) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(image.bytes), {
    headers: {
      'Content-Type': image.type,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
