import { z } from 'zod';

export const limitsSchema = z.object({
  workerPoolSize: z.number().int().min(1).max(8).default(2),
  timeoutMs: z.number().int().min(100).max(30_000).default(3_000),
  memoryLimitMb: z.number().int().min(16).max(128).default(64),
  maxToolCalls: z.number().int().min(1).max(100).default(24),
  maxInFlight: z.number().int().min(1).max(16).default(4),
});

export type Limits = z.infer<typeof limitsSchema>;
export const maxCodeBytes = 32 * 1024;
export const maxResultBytes = 256 * 1024;

export function configFromEnv() {
  const number = (key: string) => process.env[key] === undefined ? undefined : Number(process.env[key]);
  return {
    host: process.env.HOST ?? '127.0.0.1',
    port: z.coerce.number().int().min(0).max(65535).parse(process.env.PORT ?? 4310),
    token: process.env.API_TOKEN || undefined,
    snapshotPath: process.env.SNAPSHOT_PATH,
    limits: limitsSchema.parse({
      workerPoolSize: number('SANDBOX_WORKERS'),
      timeoutMs: number('SANDBOX_TIMEOUT_MS'),
      memoryLimitMb: number('SANDBOX_MEMORY_MB'),
      maxToolCalls: number('SANDBOX_MAX_TOOL_CALLS'),
      maxInFlight: number('MAX_IN_FLIGHT'),
    }),
  };
}
