import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('an MCP client can discover schemas and execute a script through the monitored entrypoint', async t => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('../src/main.js', import.meta.url)), '--stdio'],
    env: { PATH: process.env.PATH ?? '', PORT: '0', HOST: '127.0.0.1' },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'incident-desk-test', version: '1.0.0' });
  t.after(() => client.close());
  await client.connect(transport);
  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map(tool => tool.name).sort(), ['execute', 'get_schema', 'search']);
  const discovery = await client.callTool({ name: 'search', arguments: { query: 'service metrics' } });
  assert.ok(JSON.stringify(discovery).includes('metrics_compare'));
  const schema = await client.callTool({ name: 'get_schema', arguments: { tools: ['services_list'] } });
  assert.ok(JSON.stringify(schema).includes('services_list'));
  const result = await client.callTool({ name: 'execute', arguments: { code: "const s = await callTool('services_list', {}); return { count: s.services.length };" } });
  assert.equal(result.isError, undefined);
  const content = result.content as Array<{ type: string; text: string }>;
  const execution = JSON.parse(content[0]!.text);
  assert.equal(execution.value.count, 3);
  assert.equal(execution.toolCallCount, 1);
  assert.match(execution.runId, /^[0-9a-f-]{36}$/);
});
