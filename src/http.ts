import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { z, ZodError } from 'zod';
import { type IncidentDesk } from './runtime.js';
import { AppError } from './errors.js';

const bodyLimit = 48 * 1024;
const codeInput = z.object({ code: z.string() }).strict();
const investigationInput = z.object({}).strict();

function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(JSON.stringify(value));
}

async function body(req: IncomingMessage) {
  if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) {
    throw new AppError(415, 'content_type', 'Send application/json');
  }
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > bodyLimit) throw new AppError(413, 'body_too_large', 'Request exceeds 48 KiB');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new AppError(400, 'invalid_json', 'Body is not valid JSON'); }
}

function authorize(req: IncomingMessage, token?: string) {
  // No browser UI needs cross-origin access. Block browser-origin execution requests.
  if (req.headers.origin) throw new AppError(403, 'origin_not_allowed', 'Browser-origin API requests are disabled');
  if (!token) return;
  const actual = Buffer.from(req.headers.authorization ?? '');
  const expected = Buffer.from(`Bearer ${token}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new AppError(401, 'unauthorized', 'A valid bearer token is required');
  }
}

export function createHttpServer(desk: IncidentDesk, triage: string, options: { token?: string } = {}) {
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url ?? '/', 'http://localhost').pathname;
      if (req.method === 'GET' && path === '/healthz') return json(res, 200, { status: 'ok', source: desk.snapshot.source });
      if (req.method === 'GET' && path === '/metrics') {
        res.writeHead(200, { 'content-type': desk.telemetry.registry.contentType, 'cache-control': 'no-store' });
        return res.end(await desk.metrics());
      }
      authorize(req, options.token);
      if (req.method === 'GET' && path === '/') {
        return json(res, 200, { name: 'Incident Desk', source: desk.snapshot.source,
          endpoints: ['POST /api/investigate', 'POST /api/execute', 'GET /api/runs', 'GET /api/catalog', 'GET /metrics'] });
      }
      if (req.method === 'GET' && path === '/api/catalog') {
        return json(res, 200, { snapshot: desk.snapshot.id, source: desk.snapshot.source,
          observedAt: desk.snapshot.observedAt, limits: desk.limits,
          tools: await Promise.all([...desk.server.getTools().values()].map(t => t.toMcpTool())) });
      }
      if (req.method === 'GET' && path === '/api/runs') return json(res, 200, { items: desk.mode.history });
      if (req.method === 'POST' && path === '/api/investigate') {
        investigationInput.parse(await body(req));
        return json(res, 200, await desk.mode.run(triage, 'triage'));
      }
      if (req.method === 'POST' && path === '/api/execute') {
        const { code } = codeInput.parse(await body(req));
        return json(res, 200, await desk.mode.run(code));
      }
      json(res, 404, { error: { code: 'not_found', message: 'Unknown endpoint' } });
    } catch (error) {
      if (res.destroyed) return;
      if (error instanceof AppError) {
        if (error.status === 429) res.setHeader('retry-after', '1');
        return json(res, error.status, { error: { code: error.code, message: error.message } });
      }
      if (error instanceof ZodError) return json(res, 400, { error: { code: 'invalid_input', message: error.message } });
      process.stderr.write(JSON.stringify({ event: 'http_error', message: error instanceof Error ? error.message : String(error) }) + '\n');
      json(res, 500, { error: { code: 'internal_error', message: 'Unexpected server error' } });
    }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  return server;
}
