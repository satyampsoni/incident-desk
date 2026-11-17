import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { limitsSchema } from '../src/config.js';
import { createHttpServer } from '../src/http.js';
import { IncidentDesk } from '../src/runtime.js';
import { loadSnapshot } from '../src/snapshot.js';

test('HTTP boundary authenticates execution, rejects browser origins and invalid payloads, and exposes scrape metrics', async t => {
  const desk = new IncidentDesk(await loadSnapshot(), limitsSchema.parse({ workerPoolSize: 1 }),
    { log: () => {}, defaultMetrics: false });
  await desk.initialize();
  const server = createHttpServer(desk, 'return { findings: [] };', { token: 'test-token' });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await desk.close(); });
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const url = `http://127.0.0.1:${address.port}`;
  const headers = { 'content-type': 'application/json', authorization: 'Bearer test-token' };
  assert.equal((await fetch(url + '/healthz')).status, 200);
  assert.equal((await fetch(url + '/metrics')).status, 200);
  assert.equal((await fetch(url + '/api/runs')).status, 401);
  const run = await fetch(url + '/api/investigate', { method: 'POST', headers, body: '{}' });
  assert.equal(run.status, 200); assert.deepEqual((await run.json() as { value: unknown }).value, { findings: [] });
  assert.equal((await fetch(url + '/api/execute', { method: 'POST', headers: { ...headers, origin: 'https://elsewhere.example' }, body: '{"code":"return 1;"}' })).status, 403);
  assert.equal((await fetch(url + '/api/execute', { method: 'POST', headers, body: '{"code":7}' })).status, 400);
  assert.equal((await fetch(url + '/api/execute', { method: 'POST', headers, body: '{broken' })).status, 400);
  assert.equal((await fetch(url + '/api/execute', { method: 'POST', headers, body: JSON.stringify({ code: 'x'.repeat(50000) }) })).status, 413);
});
