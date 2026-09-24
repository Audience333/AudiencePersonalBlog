import type { APIRoute } from 'astro';
import { checkHealth, createHealthResponse } from '../../lib/health';
export const GET: APIRoute = () => createHealthResponse(checkHealth());
