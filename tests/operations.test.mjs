import assert from 'node:assert/strict';
import test from 'node:test';
import { checkHealth, createHealthResponse } from '../src/lib/health.ts';

test('reports health without exposing database errors', async () => {
  assert.equal(checkHealth({ prepare() { return { get() { return { value: 1 }; } }; } }), true);
  assert.equal(checkHealth({ prepare() { throw new Error('database unavailable'); } }), false);
  const failure = createHealthResponse(false);
  assert.equal(failure.status, 503);
  assert.deepEqual(await failure.json(), { ok: false });
});
