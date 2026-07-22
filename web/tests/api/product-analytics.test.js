import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from '../../api/analytics/events.js';
import { resetRateLimitMemoryForTests } from '../../api/_lib/rate-limit.js';

const valid = {
  schemaVersion: 2,
  eventId: '123e4567-e89b-42d3-a456-426614174000',
  installId: '123e4567-e89b-42d3-a456-426614174111',
  occurredAt: new Date().toISOString(), event: 'app_opened', platform: 'web', appVersion: 'web', properties: {},
};

afterEach(() => {
  delete process.env.ANALYTICS_ID_SECRET; delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN;
  resetRateLimitMemoryForTests(); vi.unstubAllGlobals();
});

describe('product analytics endpoint', () => {
  it('rejects oversized bodies before storage', async () => {
    const res = response(); await handler(request({ ...valid, padding: 'x'.repeat(2_100) }), res); expect(res.statusCode).toBe(413);
  });

  it('fails closed when HMAC or aggregate storage is unavailable', async () => {
    const res = response(); await handler(request(valid), res); expect(res.statusCode).toBe(503);
  });

  it('uses one atomic Redis write and never includes the raw install ID', async () => {
    process.env.ANALYTICS_ID_SECRET = 'x'.repeat(32); process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example'; process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
    const calls = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      const body = JSON.parse(options.body); calls.push(body);
      if (calls.length === 1) return { ok: true, json: async () => ({ result: [1, 600] }) };
      return { ok: true, json: async () => ({ result: 1 }) };
    }));
    const res = response(); await handler(request(valid), res); expect(res.statusCode).toBe(204);
    const write = JSON.stringify(calls[1]); expect(write).toContain('EVAL'); expect(write).toContain('HINCRBY'); expect(write).not.toContain(valid.installId);
  });
});

function request(body) { return { method: 'POST', body, headers: { 'x-forwarded-for': '203.0.113.44' }, socket: {} }; }
function response() { return { statusCode: 200, headers: {}, setHeader(name, value) { this.headers[name] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, end() { return this; } }; }
