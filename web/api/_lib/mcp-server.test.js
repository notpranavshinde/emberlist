import http from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const drive = vi.hoisted(() => ({ download: vi.fn(), upload: vi.fn() }));
vi.mock('./drive.js', () => ({ downloadSyncPayload: drive.download, uploadSyncPayload: drive.upload }));

import { handleMcpRequest } from './mcp-server.js';
import { emptyWorkspace } from './mcp-workspace.js';

let server;
let url;

beforeEach(async () => {
  drive.download.mockResolvedValue({ fileId: null, etag: null, payload: emptyWorkspace() });
  server = http.createServer((req, res) => {
    void handleMcpRequest(req, res, {
      authInfo: { token: 'token', clientId: 'client', scopes: ['emberlist.workspace'], expiresAt: Date.now() + 60_000 },
      accessToken: 'google-access', timeZone: 'UTC',
      revisionSecret: 'a-secret-that-is-at-least-thirty-two-characters',
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  await new Promise(resolve => server.close(resolve));
});

describe('MCP v2 transport', () => {
  it('handles initialize, tools/list, and tools/call over stateless Streamable HTTP', async () => {
    const initialized = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
      protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' },
    } });
    expect(initialized.result.serverInfo.name).toBe('Emberlist');

    const listed = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    expect(listed.result.tools.map(tool => tool.name)).toContain('list_tasks');

    const called = await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: {
      name: 'list_tasks', arguments: { limit: 10 },
    } });
    expect(called.result.structuredContent).toMatchObject({ items: [], nextCursor: null });
  });
});

async function rpc(body) {
  const response = await fetch(url, { method: 'POST', headers: {
    'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
    'MCP-Protocol-Version': '2025-11-25',
  }, body: JSON.stringify(body) });
  const text = await response.text();
  expect(response.status, text).toBe(200);
  return JSON.parse(text);
}
