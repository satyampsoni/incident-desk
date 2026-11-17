import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import { configFromEnv } from './config.js';
import { createHttpServer } from './http.js';
import { IncidentDesk } from './runtime.js';
import { loadSnapshot } from './snapshot.js';

const config = configFromEnv();
const snapshot = await loadSnapshot(config.snapshotPath);
const desk = new IncidentDesk(snapshot, config.limits);
await desk.initialize();
const triage = await readFile(new URL('../../workflows/triage.js', import.meta.url), 'utf8');
const http = createHttpServer(desk, triage, { token: config.token });
await new Promise<void>((resolve, reject) => {
  http.once('error', reject);
  http.listen(config.port, config.host, resolve);
});
const address = http.address();
process.stderr.write(JSON.stringify({ event: 'listening', url: `http://${config.host}:${typeof address === 'object' ? address?.port : config.port}`, source: snapshot.source }) + '\n');

if (process.argv.includes('--stdio')) await desk.server.start({ transport: 'stdio' });

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  const closed = new Promise<void>((resolve, reject) => http.close(error => error ? reject(error) : resolve()));
  await desk.close();
  await closed;
}
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => void shutdown().catch(error => { process.stderr.write(String(error) + '\n'); process.exitCode = 1; }));
}
