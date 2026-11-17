import { mkdir, writeFile } from 'node:fs/promises';

const datasource = { type: 'prometheus', uid: 'incident-desk-prometheus' };
let id = 0;
const panels = [];
const target = (expr, legendFormat = '', instant = false) => ({ refId: 'A', expr, legendFormat, instant, range: !instant, datasource });
function add(type, title, description, x, y, w, h, targets, unit = 'short', extra = {}) {
  const panel = {
    id: ++id, type, title, description, gridPos: { x, y, w, h }, datasource, targets,
    fieldConfig: { defaults: { unit, color: { mode: 'palette-classic' },
      thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }] },
      custom: { lineWidth: 2, fillOpacity: 12, showPoints: 'never', spanNulls: false } }, overrides: [] },
    options: type === 'stat'
      ? { reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false }, colorMode: 'value', graphMode: 'none', textMode: 'auto', wideLayout: true }
      : { tooltip: { mode: 'multi', sort: 'desc' }, legend: { displayMode: 'list', placement: 'bottom', calcs: [] } },
    ...extra,
  };
  panels.push(panel);
  return panel;
}
function row(title, y) {
  panels.push({ id: ++id, type: 'row', title, collapsed: false, gridPos: { x: 0, y, w: 24, h: 1 }, panels: [] });
}
function text(title, content, y, h = 3) {
  panels.push({ id: ++id, type: 'text', title, gridPos: { x: 0, y, w: 24, h }, options: { mode: 'markdown', content } });
}

text('INCIDENT DESK / Code Mode observatory', '**One investigation. Several tools. A bounded execution.**\n\nRuntime panels below come from real QuickJS executions. The evidence section uses a fixed, synthetic three-service snapshot. Generate activity with `npm run demo -- --traffic --include-failures`.', 0);
row('01 / Execution overview', 3);
add('stat', 'Completed executions', 'Process-lifetime count, reset when the application restarts.', 0, 4, 5, 4,
  [target('sum(incident_desk_runs_total)', '', true)]);
add('stat', 'Success', 'Process-lifetime fraction of completed executions. Blank until at least one run completes.', 5, 4, 5, 4,
  [target('100 * sum(incident_desk_runs_total{status="success"}) / sum(incident_desk_runs_total)', '', true)], 'percent', {
    fieldConfig: { defaults: { unit: 'percent', min: 0, max: 100, color: { mode: 'thresholds' }, thresholds: { mode: 'absolute', steps: [{ color: 'red', value: null }, { color: 'orange', value: 90 }, { color: 'green', value: 99 }] } }, overrides: [] },
  });
add('stat', 'Host calls / run', 'Mean handler entries across successful and failed executions. This is not model round trips.', 10, 4, 5, 4,
  [target('incident_desk_calls_per_run_sum / incident_desk_calls_per_run_count', '', true)]);
add('stat', 'Admitted now', 'Running plus waiting executions; admission is capped at four by default.', 15, 4, 4, 4,
  [target('incident_desk_in_flight', '', true)]);
add('stat', 'Workers', 'Configured capacity. The application queues a bounded number of extra requests.', 19, 4, 5, 4,
  [target('incident_desk_worker_capacity', '', true)]);
add('timeseries', 'Execution rate', 'Completed executions per second, by outcome. Deliberate demo failures are real failed sandbox executions.', 0, 8, 12, 7,
  [target('sum by (status) (rate(incident_desk_runs_total[$__rate_interval]))', '{{status}}')], 'ops', {
    fieldConfig: { defaults: { unit: 'ops', min: 0, custom: { lineWidth: 2, fillOpacity: 12 } }, overrides: ['success', 'error'].map((name, i) => ({ matcher: { id: 'byName', options: name }, properties: [{ id: 'color', value: { mode: 'fixed', fixedColor: i === 0 ? 'green' : 'red' } }] })) },
  });
add('timeseries', 'Execution duration · p95', 'Estimated histogram quantile by workflow, including queue wait. Needs recent observations; blank when idle.', 12, 8, 12, 7,
  [target('histogram_quantile(0.95, sum by (le, workflow) (rate(incident_desk_run_duration_seconds_bucket[$__rate_interval])))', '{{workflow}}')], 's');
row('02 / Work inside the sandbox', 15);
add('timeseries', 'Host tool activity', 'Only known tools are label values. Rejected arguments may fail schema validation before a handler starts.', 0, 16, 12, 7,
  [target('sum by (tool) (rate(incident_desk_tool_calls_total[$__rate_interval]))', '{{tool}}')], 'ops');
add('timeseries', 'Workers and queue', 'Point-in-time SDK pool statistics sampled when Prometheus scrapes. Short bursts can occur between scrapes.', 12, 16, 12, 7,
  [target('incident_desk_active_workers', 'active workers'), { ...target('incident_desk_queued_runs', 'queued scripts'), refId: 'B' }], 'short', {
    fieldConfig: { defaults: { min: 0, custom: { axisSoftMax: 4, lineWidth: 2 } }, overrides: [] },
  });
add('timeseries', 'Host handler duration · p95', 'Host handler time excludes guest execution, transport, and schema validation. Fixture reads are deliberately fast.', 0, 23, 12, 7,
  [target('histogram_quantile(0.95, sum by (le, tool) (rate(incident_desk_tool_duration_seconds_bucket[$__rate_interval])))', '{{tool}}')], 's');
add('timeseries', 'Admission rejections', 'Rejections before admission, separate from completed failed executions.', 12, 23, 12, 7,
  [target('sum by (reason) (rate(incident_desk_rejections_total[$__rate_interval]))', '{{reason}}')], 'ops', {
    fieldConfig: { defaults: { unit: 'ops', min: 0, custom: { axisSoftMax: 1, lineWidth: 2 } }, overrides: [] },
  });
add('timeseries', 'Node process memory', 'RSS includes the process and worker threads. V8 heap is not a measure of QuickJS sandbox allocation.', 0, 30, 12, 7,
  [target('incident_desk_process_resident_memory_bytes', 'RSS'), { ...target('incident_desk_nodejs_heap_size_used_bytes', 'V8 heap used'), refId: 'B' }], 'bytes');
add('timeseries', 'Mean returned result size', 'Serialized result values, excluding the envelope. No token-saving claim is inferred from these bytes.', 12, 30, 12, 7,
  [target('sum(rate(incident_desk_result_bytes_sum[$__rate_interval])) / sum(rate(incident_desk_result_bytes_count[$__rate_interval]))', 'result')], 'bytes');
row('03 / Investigation evidence — FIXED DEMO SNAPSHOT', 37);
text('Evidence provenance', '**Synthetic fixture, observed 17 November 2026 at 10:00 UTC. These are not live production service metrics.**\n\nEqual 20-minute windows: 09:20–09:40 and 09:40–10:00 UTC. Error rates and latency are supplied by the fixture. Finding counts update only after the canonical triage workflow succeeds; custom scripts cannot publish findings.', 38);
add('stat', 'Critical findings', 'Count in the latest successful canonical triage report; not the number of failed sandbox runs.', 0, 41, 6, 4,
  [target('incident_desk_triage_findings{severity="critical"}', '', true)], 'short', {
    fieldConfig: { defaults: { color: { mode: 'thresholds' }, thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }, { color: 'red', value: 1 }] } }, overrides: [] },
  });
add('stat', 'Watch findings', 'Count in the latest successful canonical triage report.', 6, 41, 6, 4,
  [target('incident_desk_triage_findings{severity="watch"}', '', true)], 'short', {
    fieldConfig: { defaults: { color: { mode: 'thresholds' }, thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }, { color: 'orange', value: 1 }] } }, overrides: [] },
  });
add('stat', 'Seconds since triage', 'Age of the latest successful canonical run, not age of the underlying fixed snapshot.', 12, 41, 6, 4,
  [target('time() - (incident_desk_last_triage_timestamp_seconds > 0)', '', true)], 's');
add('stat', 'Scrape health', 'Prometheus can reach the application. This is not a guarantee that every investigation will succeed.', 18, 41, 6, 4,
  [target('up{job="incident-desk"}', '', true)], 'short', {
    fieldConfig: { defaults: { mappings: [{ type: 'value', options: { '0': { text: 'DOWN', color: 'red' }, '1': { text: 'UP', color: 'green' } } }] }, overrides: [] },
  });
add('bargauge', 'Fixture error fraction · before / after', 'Fixed service evidence. Each bar is errors divided by requests in one window.', 0, 45, 12, 7,
  [target('incident_desk_snapshot_error_ratio', '{{service}} / {{window}}', true)], 'percentunit', {
    options: { orientation: 'horizontal', displayMode: 'gradient', reduceOptions: { calcs: ['lastNotNull'], values: false }, showUnfilled: true },
    fieldConfig: { defaults: { unit: 'percentunit', min: 0, max: 0.1, thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }, { color: 'orange', value: 0.01 }, { color: 'red', value: 0.05 }] }, color: { mode: 'thresholds' } }, overrides: [] },
  });
add('bargauge', 'Fixture p95 latency · before / after', 'Supplied per-window percentiles, not averages of percentiles or execution latency.', 12, 45, 12, 7,
  [target('incident_desk_snapshot_p95_seconds', '{{service}} / {{window}}', true)], 's', {
    options: { orientation: 'horizontal', displayMode: 'gradient', reduceOptions: { calcs: ['lastNotNull'], values: false }, showUnfilled: true },
    fieldConfig: { defaults: { unit: 's', min: 0, max: 2, thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }, { color: 'orange', value: 0.5 }, { color: 'red', value: 1 }] }, color: { mode: 'thresholds' } }, overrides: [] },
  });

const dashboard = {
  uid: 'incident-desk', title: 'Incident Desk / Code Mode', description: 'NitroStack sandbox execution and a clearly separated synthetic incident evidence snapshot.',
  tags: ['nitrostack', 'code-mode', 'incident-desk'], schemaVersion: 41, version: 1,
  editable: false, timezone: 'browser', refresh: '5s', time: { from: 'now-15m', to: 'now' },
  graphTooltip: 1, panels, templating: { list: [] }, annotations: { list: [] },
};
const output = new URL('../observability/grafana/dashboards/incident-desk.json', import.meta.url);
await mkdir(new URL('.', output), { recursive: true });
await writeFile(output, JSON.stringify(dashboard, null, 2) + '\n');
process.stdout.write(`Wrote ${panels.length} panels to ${output.pathname}\n`);
