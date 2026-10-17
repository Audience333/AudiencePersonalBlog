import type { APIRoute } from 'astro';
import { listMusicTracks } from '../../lib/music';

export const GET: APIRoute = () => {
  return Response.json(
    { tracks: listMusicTracks() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
};
