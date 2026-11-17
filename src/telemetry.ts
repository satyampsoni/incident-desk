import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from '@prometheus-io/client';

export class Telemetry {
  readonly registry = new Registry();
  readonly runs = new Counter({
    name: 'incident_desk_runs_total', help: 'Completed sandbox executions.',
    labelNames: ['workflow', 'status'] as const, registers: [this.registry],
  });
  readonly duration = new Histogram({
    name: 'incident_desk_run_duration_seconds', help: 'Wall time including sandbox queue wait.',
    labelNames: ['workflow', 'status'] as const,
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 3, 5, 10], registers: [this.registry],
  });
  readonly toolCalls = new Counter({
    name: 'incident_desk_tool_calls_total', help: 'Host tool invocations that entered a handler.',
    labelNames: ['tool', 'status'] as const, registers: [this.registry],
  });
  readonly toolDuration = new Histogram({
    name: 'incident_desk_tool_duration_seconds', help: 'Host handler duration; excludes schema validation.',
    labelNames: ['tool'] as const, buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.5], registers: [this.registry],
  });
  readonly callsPerRun = new Histogram({
    name: 'incident_desk_calls_per_run', help: 'Host handler entries per completed execution, including failed executions.',
    buckets: [0, 1, 2, 4, 8, 12, 16, 24], registers: [this.registry],
  });
  readonly responseBytes = new Histogram({
    name: 'incident_desk_result_bytes', help: 'Serialized successful sandbox result bytes before the HTTP envelope.',
    buckets: [128, 512, 1024, 4096, 16384, 65536, 262144], registers: [this.registry],
  });
  readonly inFlight = new Gauge({ name: 'incident_desk_in_flight', help: 'Admitted executions, running or waiting.', registers: [this.registry] });
  readonly rejections = new Counter({
    name: 'incident_desk_rejections_total', help: 'Executions rejected before sandbox admission.',
    labelNames: ['reason'] as const, registers: [this.registry],
  });
  readonly workers = new Gauge({ name: 'incident_desk_worker_capacity', help: 'Configured QuickJS worker count.', registers: [this.registry] });
  readonly activeWorkers = new Gauge({ name: 'incident_desk_active_workers', help: 'Workers currently executing.', registers: [this.registry] });
  readonly queue = new Gauge({ name: 'incident_desk_queued_runs', help: 'Scripts waiting for a worker.', registers: [this.registry] });
  readonly findings = new Gauge({
    name: 'incident_desk_triage_findings', help: 'Findings from the last successful canonical triage run over the configured snapshot.',
    labelNames: ['severity'] as const, registers: [this.registry],
  });
  readonly lastTriage = new Gauge({ name: 'incident_desk_last_triage_timestamp_seconds', help: 'Wall-clock completion time of the last successful canonical triage run.', registers: [this.registry] });
  readonly snapshotErrorRatio = new Gauge({
    name: 'incident_desk_snapshot_error_ratio', help: 'Error fraction in the fixed evidence snapshot, not live service telemetry.',
    labelNames: ['service', 'window'] as const, registers: [this.registry],
  });
  readonly snapshotLatency = new Gauge({
    name: 'incident_desk_snapshot_p95_seconds', help: 'Provided per-window p95 in the fixed evidence snapshot, not a quantile of execution time.',
    labelNames: ['service', 'window'] as const, registers: [this.registry],
  });

  constructor(workerCount: number, defaults = true) {
    this.workers.set(workerCount);
    this.inFlight.set(0);
    this.activeWorkers.set(0);
    this.queue.set(0);
    for (const workflow of ['triage', 'custom']) {
      for (const status of ['success', 'error']) this.runs.labels(workflow, status).inc(0);
    }
    for (const reason of ['capacity', 'invalid_request', 'shutting_down']) this.rejections.labels(reason).inc(0);
    if (defaults) collectDefaultMetrics({ register: this.registry, prefix: 'incident_desk_' });
  }
}
