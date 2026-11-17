import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { limitsSchema } from '../src/config.js';
import { IncidentDesk } from '../src/runtime.js';
import { loadSnapshot, snapshotSchema } from '../src/snapshot.js';

const snapshot = await loadSnapshot();
const triage = await readFile(new URL('../../workflows/triage.js', import.meta.url), 'utf8');

async function create(overrides = {}) {
  const desk = new IncidentDesk(snapshot, limitsSchema.parse({ workerPoolSize: 1, timeoutMs: 500, ...overrides }),
    { log: () => {}, defaultMetrics: false });
  await desk.initialize();
  return desk;
}

test('triage joins evidence, skips detail queries for healthy services, and counts actual tool calls', async t => {
  const desk = await create(); t.after(() => desk.close());
  const execution = await desk.mode.run(triage, 'triage');
  const value = execution.value as { servicesChecked: number; source: string; findings: Array<Record<string, unknown>> };
  assert.equal(value.source, 'synthetic-fixture');
  assert.equal(value.servicesChecked, 3);
  assert.deepEqual(value.findings.map(f => [f.service, f.severity]), [['checkout', 'critical'], ['inventory', 'watch']]);
  assert.equal(value.findings[0]?.errorRateRatio, 12);
  assert.equal(execution.toolCallCount, 8);
  assert.equal(desk.mode.history[0]?.toolCalls, 8);
  const metrics = await desk.metrics();
  assert.match(metrics, /incident_desk_runs_total\{workflow="triage",status="success"\} 1/);
  assert.match(metrics, /incident_desk_calls_per_run_sum 8/);
  assert.ok(!metrics.includes(execution.runId), 'Run IDs must not become metric labels');
  await desk.mode.run('return { findings: [] };');
  assert.match(await desk.metrics(), /incident_desk_triage_findings\{severity="critical"\} 1/,
    'Custom results must not replace the canonical findings');
});

test('guest code has no host globals, and a fresh interpreter is used for each run', async t => {
  const desk = await create(); t.after(() => desk.close());
  const first = await desk.mode.run("globalThis.leftover = 1; return [typeof process, typeof require, typeof fetch, typeof Buffer];");
  assert.deepEqual(first.value, ['undefined', 'undefined', 'undefined', 'undefined']);
  const second = await desk.mode.run('return typeof globalThis.leftover;');
  assert.equal(second.value, 'undefined');
});

test('tool input validation and unknown-tool rejection happen inside the real bridge', async t => {
  const desk = await create(); t.after(() => desk.close());
  await assert.rejects(desk.mode.run("return await callTool('metrics_compare', { service: 'nonexistent' });"));
  await assert.rejects(desk.mode.run("return await callTool('erase_database', {});"));
  await assert.rejects(desk.mode.run("return await callTool('execute', { code: 'return 1;' });"));
  assert.equal(desk.mode.history.filter(r => r.status === 'error').length, 3);
});

test('CPU timeout terminates a worker and a subsequent investigation still succeeds', async t => {
  const desk = await create({ timeoutMs: 150 }); t.after(() => desk.close());
  await assert.rejects(desk.mode.run('while (true) {}'), /tim|interrupt|limit/i);
  assert.equal((await desk.mode.run('return 42;')).value, 42);
  assert.equal(desk.mode.history[1]?.status, 'error');
});

test('tool budget stops a loop without poisoning the next execution', async t => {
  const desk = await create({ maxToolCalls: 2 }); t.after(() => desk.close());
  await assert.rejects(desk.mode.run("for (let i = 0; i < 3; i++) await callTool('services_list', {}); return true;"), /tool|limit/i);
  assert.equal((await desk.mode.run('return true;')).value, true);
});

test('admission is bounded independently of the SDK worker queue', async t => {
  const desk = await create({ maxInFlight: 1, timeoutMs: 150 }); t.after(() => desk.close());
  const running = desk.mode.run('while (true) {}');
  const completed = assert.rejects(running);
  await assert.rejects(desk.mode.run('return 1;'), error => (error as { status: number }).status === 429);
  await completed;
  assert.match(await desk.metrics(), /incident_desk_rejections_total\{reason="capacity"\} 1/);
});

test('output and source-code limits reject oversized payloads', async t => {
  const desk = await create(); t.after(() => desk.close());
  await assert.rejects(desk.mode.run("return 'x'.repeat(300000);"), /256 KiB/);
  await assert.rejects(desk.mode.run(' '.repeat(32769)), /32768/);
});

test('snapshots reject inconsistent counts, duplicate identities, and incomparable windows', () => {
  const counts = structuredClone(snapshot); counts.services[0]!.after.errors = 100000;
  assert.equal(snapshotSchema.safeParse(counts).success, false);
  const duplicate = structuredClone(snapshot); duplicate.services[1]!.id = duplicate.services[0]!.id;
  assert.equal(snapshotSchema.safeParse(duplicate).success, false);
  const windows = structuredClone(snapshot); windows.windows.before.to = '2026-11-17T09:39:00Z';
  assert.equal(snapshotSchema.safeParse(windows).success, false);
});
