import { getDb } from './db.ts';

export function checkHealth(db: Pick<ReturnType<typeof getDb>, 'prepare'> = getDb()): boolean {
  try { db.prepare('SELECT 1').get(); return true; } catch { return false; }
}

export function createHealthResponse(healthy: boolean): Response {
  return Response.json({ ok: healthy }, { status: healthy ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
