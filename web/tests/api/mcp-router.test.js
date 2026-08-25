import { describe, expect, it } from 'vitest';
import handler from '../../api/drive/sync-file.js';

describe('consolidated MCP router', () => {
  it('dispatches rewritten public routes inside the existing Drive function', () => {
    const res = response();
    handler(request('oauth-protected-resource'), res);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({
      resource: 'https://emberlist.test/api/mcp',
      authorization_servers: ['https://emberlist.test'],
    });
  });

  it('rejects unknown internal route markers', () => {
    const res = response();
    handler(request('unknown'), res);
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: 'not_found' });
  });
});

function request(route) {
  return {
    method: 'GET',
    url: `/api/drive/sync-file?mcp_route=${route}`,
    query: { mcp_route: route },
    headers: {
      host: 'emberlist.test',
      'x-forwarded-host': 'emberlist.test',
      'x-forwarded-proto': 'https',
    },
  };
}

function response() {
  const headers = new Map();
  return {
    statusCode: 200,
    body: '',
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    getHeader(name) { return headers.get(name.toLowerCase()); },
    end(value = '') { this.body = value; },
  };
}
