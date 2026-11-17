import { createHash, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { CodeModeTransform, NitroStackServer, Tool, createLogger, type ExecutionContext,
  type NextToolHandler, type SandboxExecutionResult } from '@nitrostack/core';
import { z } from 'zod';
import { type Limits, maxCodeBytes, maxResultBytes } from './config.js';
import { AppError } from './errors.js';
import { type Snapshot } from './snapshot.js';
import { Telemetry } from './telemetry.js';

type Workflow = 'triage' | 'custom';
export type RunSummary = {
  id: string; workflow: Workflow; status: 'success' | 'error'; startedAt: string;
  durationMs: number; toolCalls: number; resultBytes: number; codeHash: string; error?: string;
};
type Execution = SandboxExecutionResult & { runId: string; workflow: Workflow };

const logger = createLogger({ level: 'warn', serviceName: 'incident-desk' });
const executeInput = z.object({ code: z.string().min(1) }).strict();

// Both HTTP and MCP enter this class, so neither can skip admission or telemetry.
class ObservedCodeMode extends CodeModeTransform {
  readonly history: RunSummary[] = [];
  private readonly calls = new Map<string, number>();
  private readonly pending = new Set<Promise<unknown>>();
  private accepting = true;

  constructor(readonly limits: Limits, readonly telemetry: Telemetry,
    private readonly log: (entry: RunSummary) => void,
    private readonly publishTriage: (value: unknown) => void) {
    super({ ...limits, allowDestructive: false });
  }

  async run(code: string, workflow: Workflow = 'custom', context?: ExecutionContext): Promise<Execution> {
    const reject = (reason: string, status: number, message: string): never => {
      this.telemetry.rejections.labels(reason).inc();
      throw new AppError(status, reason, message);
    };
    if (!this.accepting) reject('shutting_down', 503, 'Server is shutting down');
    if (typeof code !== 'string' || !code.trim() || Buffer.byteLength(code) > maxCodeBytes) {
      reject('invalid_request', 400, 'Code must contain between 1 and 32768 UTF-8 bytes');
    }
    if (this.pending.size >= this.limits.maxInFlight) {
      reject('capacity', 429, 'Execution capacity reached; retry after a running investigation completes');
    }
    const task = this.perform(code, workflow, context);
    this.pending.add(task);
    try { return await task; }
    finally { this.pending.delete(task); }
  }

  override async execute(code: string, context?: ExecutionContext): Promise<Execution> {
    return this.run(code, 'custom', context);
  }

  private async perform(code: string, workflow: Workflow, context?: ExecutionContext): Promise<Execution> {
    const id = randomUUID();
    const start = performance.now();
    const summary: RunSummary = {
      id, workflow, status: 'error', startedAt: new Date().toISOString(), durationMs: 0,
      toolCalls: 0, resultBytes: 0, codeHash: createHash('sha256').update(code).digest('hex'),
    };
    this.calls.set(id, 0);
    this.telemetry.inFlight.inc();
    try {
      const result = await super.execute(code, { ...context, requestId: id, logger: context?.logger ?? logger });
      summary.resultBytes = Buffer.byteLength(JSON.stringify(result.value ?? null));
      if (summary.resultBytes > maxResultBytes) {
        throw new AppError(422, 'result_too_large', 'Result exceeds 256 KiB; aggregate or project fields before returning');
      }
      if (workflow === 'triage') this.publishTriage(result.value);
      summary.status = 'success';
      this.telemetry.responseBytes.observe(summary.resultBytes);
      return { ...result, runId: id, workflow };
    } catch (error) {
      summary.error = (error instanceof Error ? error.message : String(error)).slice(0, 500);
      if (error instanceof AppError) throw error;
      throw new AppError(422, 'execution_failed', summary.error);
    } finally {
      summary.durationMs = performance.now() - start;
      summary.toolCalls = this.calls.get(id) ?? 0;
      this.calls.delete(id);
      this.telemetry.inFlight.dec();
      this.telemetry.runs.labels(workflow, summary.status).inc();
      this.telemetry.duration.labels(workflow, summary.status).observe(summary.durationMs / 1000);
      this.telemetry.callsPerRun.observe(summary.toolCalls);
      this.history.unshift(summary);
      this.history.length = Math.min(this.history.length, 100);
      this.log(summary);
    }
  }

  recordToolEntry(context: ExecutionContext) {
    if (this.calls.has(context.requestId)) this.calls.set(context.requestId, this.calls.get(context.requestId)! + 1);
  }

  override async resolveTool(name: string, next: NextToolHandler, context?: ExecutionContext): Promise<Tool | undefined> {
    if (name !== 'execute') return super.resolveTool(name, next, context);
    return new Tool({
      name: 'execute',
      description: 'Run an ES2020 investigation script in QuickJS. Use await callTool(name, args); return a compact evidence report. No Node.js or network access. Read-only tools only.',
      inputSchema: executeInput,
      handler: async (input, ctx) => {
        const { code } = executeInput.parse(input);
        const result = await this.run(code, 'custom', ctx);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      },
    });
  }

  updatePoolMetrics() {
    const stats = this.getWorkerPool()?.getStats();
    this.telemetry.activeWorkers.set(stats?.activeTasks ?? 0);
    this.telemetry.queue.set(stats?.queuedTasks ?? 0);
  }

  async drain() {
    this.accepting = false;
    await Promise.allSettled([...this.pending]);
  }
}

export class IncidentDesk {
  readonly telemetry: Telemetry;
  readonly mode: ObservedCodeMode;
  readonly server: NitroStackServer;

  constructor(readonly snapshot: Snapshot, readonly limits: Limits,
    options: { log?: (entry: RunSummary) => void; defaultMetrics?: boolean } = {}) {
    this.telemetry = new Telemetry(limits.workerPoolSize, options.defaultMetrics);
    this.mode = new ObservedCodeMode(limits, this.telemetry,
      options.log ?? (entry => process.stderr.write(JSON.stringify({ event: 'execution_completed', ...entry }) + '\n')),
      value => {
        const report = z.object({ findings: z.array(z.object({ severity: z.enum(['critical', 'watch']) })).max(20) }).parse(value);
        for (const severity of ['critical', 'watch']) {
          this.telemetry.findings.labels(severity).set(report.findings.filter(f => f.severity === severity).length);
        }
        this.telemetry.lastTriage.set(Date.now() / 1000);
      });
    this.server = new NitroStackServer({
      name: 'incident-desk', version: '0.1.0', transforms: [this.mode],
      logging: { level: 'warn' },
    });
    this.registerTools();
    for (const service of snapshot.services) {
      for (const window of ['before', 'after'] as const) {
        this.telemetry.snapshotErrorRatio.labels(service.id, window).set(service[window].errors / service[window].requests);
        this.telemetry.snapshotLatency.labels(service.id, window).set(service[window].p95LatencyMs / 1000);
      }
    }
  }

  private registerTools() {
    const serviceInput = z.object({ service: z.enum(this.snapshot.services.map(s => s.id) as [string, ...string[]]) }).strict();
    const find = (input: unknown) => {
      const { service } = serviceInput.parse(input);
      return this.snapshot.services.find(s => s.id === service)!;
    };
    const definitions = [
      {
        name: 'services_list', description: 'List services, owners, observation time, and the two comparison windows.',
        inputSchema: z.object({}).strict(),
        handler: (input: unknown) => {
          z.object({}).strict().parse(input);
          return { snapshot: this.snapshot.id, source: this.snapshot.source, observedAt: this.snapshot.observedAt,
            windows: this.snapshot.windows, services: this.snapshot.services.map(({ id, owner }) => ({ id, owner })) };
        },
      },
      {
        name: 'metrics_compare', description: 'Get request counts, error counts, and p95 latency for equal-duration before/after windows of one service.',
        inputSchema: serviceInput,
        handler: (input: unknown) => { const s = find(input); return { service: s.id, before: s.before, after: s.after }; },
      },
      {
        name: 'deployments_list', description: 'List deployment evidence for a service in this snapshot. Temporal proximity is not proof of causation.',
        inputSchema: serviceInput,
        handler: (input: unknown) => { const s = find(input); return { service: s.id, items: s.deployments }; },
      },
      {
        name: 'errors_sample', description: 'Get a bounded illustrative error sample for a service. Samples are not the complete error population.',
        inputSchema: serviceInput,
        handler: (input: unknown) => { const s = find(input); return { service: s.id, items: s.errorSamples }; },
      },
    ];
    for (const definition of definitions) {
      this.telemetry.toolDuration.labels(definition.name);
      for (const status of ['success', 'error']) this.telemetry.toolCalls.labels(definition.name, status).inc(0);
      this.server.registerTool(new Tool({
        ...definition,
        annotations: { readOnlyHint: true, destructiveHint: false },
        handler: async (input, context) => {
          this.mode.recordToolEntry(context);
          const stop = this.telemetry.toolDuration.startTimer({ tool: definition.name });
          try {
            context.abortSignal?.throwIfAborted();
            const value = definition.handler(input);
            this.telemetry.toolCalls.labels(definition.name, 'success').inc();
            return value;
          } catch (error) {
            this.telemetry.toolCalls.labels(definition.name, 'error').inc();
            throw error;
          } finally { stop(); }
        },
      }));
    }
  }

  async initialize() { await this.server.runToolPipeline(); }
  async metrics() {
    this.mode.updatePoolMetrics();
    return this.telemetry.registry.metrics();
  }
  async close() {
    await this.mode.drain();
    await this.server.stop();
    this.telemetry.registry.clear();
  }
}
