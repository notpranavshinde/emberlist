import { afterEach, describe, expect, it, vi } from 'vitest';
import handler, { validateEvent } from '../../api/analytics/onboarding.js';
import { resetRateLimitMemoryForTests } from '../../api/_lib/rate-limit.js';

const valid = {
  schemaVersion: 1,
  eventId: '6ba7b810-9dad-41d1-80b4-00c04fd430c8',
  event: 'onboarding_completed',
  platform: 'web',
  appVersion: 'web-1',
  onboardingVersion: 2,
  properties: { method: 'first_task', elapsedBucket: 'under_30s' },
};

describe('onboarding analytics API validation', () => {
  afterEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    resetRateLimitMemoryForTests();
    vi.unstubAllGlobals();
  });
  it('accepts the strict allowlisted shape', () => {
    expect(validateEvent(valid)).toEqual(valid);
  });

  it('rejects content fields and unknown events', () => {
    expect(() => validateEvent({ ...valid, taskTitle: 'private' })).toThrow('Unknown event field');
    expect(() => validateEvent({ ...valid, event: 'task_created' })).toThrow('Unknown event');
  });

  it('rejects identifiers and free-form properties', () => {
    expect(() => validateEvent({ ...valid, eventId: 'device-1' })).toThrow('Invalid event ID');
    expect(() => validateEvent({ ...valid, properties: { error: 'raw message' } })).toThrow('Unknown property');
  });

  it('rejects bodies over 2 KB even without a content-length header', async () => {
    const response = createResponse();
    await handler(createRequest({ ...valid, padding: 'x'.repeat(2_100) }), response);
    expect(response.statusCode).toBe(413);
  });

  it('fails closed when aggregate storage is unavailable', async () => {
    const response = createResponse();
    await handler(createRequest(valid), response);
    expect(response.statusCode).toBe(503);
  });

  it('uses one atomic dedupe-and-increment Redis operation with retention', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
    const calls = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      calls.push(JSON.parse(options.body));
      if (calls.length === 1) return { ok: true, json: async () => ({ result: [1, 600] }) };
      return { ok: true };
    }));
    const response = createResponse();
    await handler(createRequest(valid), response);
    expect(response.statusCode).toBe(204);
    const aggregate = calls[1];
    expect(aggregate[0]).toBe('EVAL');
    expect(aggregate[1]).toContain("SET', KEYS[1], '1', 'EX'");
    expect(aggregate[1]).toContain('HINCRBY');
    expect(aggregate).toContain(String(30 * 24 * 60 * 60));
    expect(aggregate).toContain(String(400 * 24 * 60 * 60));
  });

  it('rate limits repeated requests by short-lived hashed IP', async () => {
    let last;
    for (let index = 0; index < 31; index += 1) {
      last = createResponse();
      await handler(createRequest(valid), last);
    }
    expect(last.statusCode).toBe(429);
    expect(last.headers['Retry-After']).toBeDefined();
  });
});

function createRequest(body) {
  return {
    method: 'POST',
    body,
    headers: { 'x-forwarded-for': '203.0.113.10' },
    socket: {},
  };
}

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}
