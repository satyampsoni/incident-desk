import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';

const app = process.env.APP_URL ?? 'http://127.0.0.1:4310';
const prometheus = process.env.PROMETHEUS_URL ?? 'http://127.0.0.1:4312';
const grafana = process.env.GRAFANA_URL ?? 'http://127.0.0.1:4311';
const headers = { 'content-type': 'application/json', ...(process.env.API_TOKEN ? { authorization: `Bearer ${process.env.API_TOKEN}` } : {}) };
const get = async url => {
  const response = await fetch(url);
  assert.ok(response.ok, `${url}: HTTP ${response.status}`);
  return response.json();
};
const query = async expression => {
  const result = await get(prometheus + '/api/v1/query?query=' + encodeURIComponent(expression));
  assert.equal(result.status, 'success', expression);
  return result.data.result;
};

assert.equal((await get(app + '/healthz')).status, 'ok');
const response = await fetch(app + '/api/investigate', { method: 'POST', headers, body: '{}' });
assert.equal(response.status, 200);
const run = await response.json();
assert.equal(run.toolCallCount, 8);
assert.deepEqual(run.value.findings.map(f => [f.service, f.severity]), [['checkout', 'critical'], ['inventory', 'watch']]);

// Wait for a real scrape, not just for /metrics to return text.
let observed = false;
for (let attempt = 0; attempt < 10; attempt++) {
  const result = await query('incident_desk_triage_findings{severity="critical"}');
  if (result.some(series => Number(series.value[1]) === 1)) { observed = true; break; }
  await setTimeout(1000);
}
assert.ok(observed, 'Prometheus did not ingest triage evidence');
assert.equal(Number((await query('up{job="incident-desk"}'))[0]?.value[1]), 1);
const dashboard = await get(grafana + '/api/dashboards/uid/incident-desk');
assert.equal(dashboard.dashboard.uid, 'incident-desk');
const panels = dashboard.dashboard.panels;
let expressions = 0;
for (const panel of panels) {
  for (const target of panel.targets ?? []) {
    await query(target.expr.replaceAll('$__rate_interval', '1m'));
    expressions++;
  }
}
const rules = await get(prometheus + '/api/v1/rules');
assert.equal(rules.data.groups[0].rules.length, 3);
assert.ok(rules.data.groups[0].rules.every(rule => rule.health === 'ok'));

await mkdir('docs/examples', { recursive: true });
await writeFile('docs/examples/investigation.json', JSON.stringify(run, null, 2) + '\n');
const report = {
  checkedAt: new Date().toISOString(),
  app, prometheus, grafana,
  checks: { health: 'passed', investigation: 'passed', prometheusIngestion: 'passed', dashboardProvisioning: 'passed', panelExpressions: expressions, alertRules: 3 },
  dashboardPanels: panels.length,
  note: 'Synthetic incident data; actual sandbox execution, metrics, and Grafana provisioning.',
};
await writeFile('docs/examples/stack-verification.json', JSON.stringify(report, null, 2) + '\n');
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
