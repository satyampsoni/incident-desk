import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const windowMetrics = z.object({
  requests: z.number().int().positive().max(1_000_000),
  errors: z.number().int().nonnegative().max(1_000_000),
  p95LatencyMs: z.number().nonnegative(),
}).refine(value => value.errors <= value.requests, 'Errors cannot exceed requests');

const windowRange = z.object({ from: z.string().datetime(), to: z.string().datetime() })
  .refine(value => Date.parse(value.from) < Date.parse(value.to), 'Window must end after it starts');

export const snapshotSchema = z.object({
  id: z.string().min(1).max(100),
  source: z.string().min(1).max(100),
  observedAt: z.string().datetime(),
  windows: z.object({ before: windowRange, after: windowRange }),
  services: z.array(z.object({
    id: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
    owner: z.string().min(1).max(80),
    before: windowMetrics,
    after: windowMetrics,
    deployments: z.array(z.object({
      version: z.string().max(120), deployedAt: z.string().datetime(), summary: z.string().max(500),
    })).max(20),
    errorSamples: z.array(z.object({
      timestamp: z.string().datetime(), code: z.string().max(120), message: z.string().max(1000),
    })).max(20),
  })).min(1).max(20),
}).superRefine((value, ctx) => {
  if (new Set(value.services.map(s => s.id)).size !== value.services.length) {
    ctx.addIssue({ code: 'custom', message: 'Service IDs must be unique' });
  }
  const duration = (w: { from: string; to: string }) => Date.parse(w.to) - Date.parse(w.from);
  if (duration(value.windows.before) !== duration(value.windows.after)) {
    ctx.addIssue({ code: 'custom', message: 'Comparison windows must have equal durations' });
  }
  if (Date.parse(value.windows.before.to) > Date.parse(value.windows.after.from)) {
    ctx.addIssue({ code: 'custom', message: 'Comparison windows must not overlap' });
  }
});

export type Snapshot = z.infer<typeof snapshotSchema>;
export const defaultSnapshotPath = fileURLToPath(new URL('../../data/snapshot.json', import.meta.url));

export async function loadSnapshot(path = defaultSnapshotPath): Promise<Snapshot> {
  const bytes = await readFile(path);
  if (bytes.length > 1024 * 1024) throw new Error('Snapshot exceeds 1 MiB');
  return snapshotSchema.parse(JSON.parse(bytes.toString('utf8')));
}
