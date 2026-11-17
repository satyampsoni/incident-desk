import { setTimeout } from 'node:timers/promises';

const base = process.env.APP_URL ?? 'http://127.0.0.1:4310';
const headers = { 'content-type': 'application/json', ...(process.env.API_TOKEN ? { authorization: `Bearer ${process.env.API_TOKEN}` } : {}) };
const traffic = process.argv.includes('--traffic');
const failures = process.argv.includes('--include-failures');
const countFlag = process.argv.indexOf('--count');
const count = countFlag < 0 ? 60 : Number(process.argv[countFlag + 1]);
if (!Number.isInteger(count) || count < 1 || count > 1000) throw new Error('--count must be an integer between 1 and 1000');

async function run(path, payload, expected = 200) {
  const response = await fetch(base + path, { method: 'POST', headers, body: JSON.stringify(payload) });
  const result = await response.json();
  if (response.status !== expected) throw new Error(`Expected ${expected}, got ${response.status}: ${JSON.stringify(result)}`);
  return result;
}

if (!traffic) {
  const result = await run('/api/investigate', {});
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} else {
  process.stdout.write(`Generating ${count} real sandbox executions against demo data. This is not a benchmark.\n`);
  for (let i = 0; i < count; i++) {
    if (failures && i % 10 === 9) {
      await run('/api/execute', { code: "throw new Error('deliberate-demo-failure');" }, 422);
    } else if (i % 4 === 0) {
      await run('/api/execute', { code: "const s = await callTool('services_list', {}); return { services: s.services.length };" });
    } else {
      await run('/api/investigate', {});
    }
    if ((i + 1) % 10 === 0) process.stdout.write(`${i + 1}/${count} completed\n`);
    await setTimeout(1000);
  }
}
