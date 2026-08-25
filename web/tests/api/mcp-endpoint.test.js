import { afterEach, describe, expect, it } from 'vitest';
import handler from '../../server/mcp/resource.js';
import { resetRateLimitMemoryForTests } from '../../api/_lib/rate-limit.js';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  resetRateLimitMemoryForTests();
});

describe('MCP resource endpoint', () => {
  it('uses the configured canonical origin in bearer discovery challenges', async () => {
    process.env.EMBERLIST_MCP_ENABLED = 'true';
    process.env.EMBERLIST_MCP_AUTH_SECRET = 'a-secret-that-is-at-least-thirty-two-characters';
    process.env.EMBERLIST_APP_ORIGIN = 'https://emberlist.dev';
    process.env.EMBERLIST_MCP_RESOURCE = 'https://emberlist.dev/api/mcp';
    const req = { method: 'POST', headers: { host: 'attacker.example' } };
    const res = response();

    await handler(req, res);

    expect(res.statusCode).toBe(401);
    expect(res.headers['www-authenticate']).toBe(
      'Bearer resource_metadata="https://emberlist.dev/.well-known/oauth-protected-resource/api/mcp"',
    );
  });

  it('rate limits requests before bearer token resolution', async () => {
    process.env.EMBERLIST_MCP_ENABLED = 'true';
    process.env.EMBERLIST_MCP_AUTH_SECRET = 'a-secret-that-is-at-least-thirty-two-characters';
    process.env.EMBERLIST_APP_ORIGIN = 'https://emberlist.dev';
    for (let index = 0; index < 121; index += 1) {
      const res = response();
      await handler({ method: 'POST', headers: {}, socket: { remoteAddress: '192.0.2.20' } }, res);
      if (index === 120) expect(res.statusCode).toBe(429);
    }
  });
});

function response() {
  return {
    headers: {}, statusCode: 200, headersSent: false, writableEnded: false,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(body) { this.body = body; this.writableEnded = true; },
  };
}
