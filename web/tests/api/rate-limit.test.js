import { beforeEach, describe, expect, it } from 'vitest';
import { enforceRateLimit, resetRateLimitMemoryForTests } from '../../api/_lib/rate-limit.js';

beforeEach(() => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  resetRateLimitMemoryForTests();
});

describe('rate limiter', () => {
  it('returns a retry interval after the limit is exceeded', async () => {
    const req = { headers: { 'x-forwarded-for': '192.0.2.5' } };
    const res = response();
    const options = { name: 'test', limit: 2, windowSeconds: 60 };

    await enforceRateLimit(req, res, options);
    await enforceRateLimit(req, res, options);
    await expect(enforceRateLimit(req, res, options)).rejects.toMatchObject({ statusCode: 429 });
    expect(res.getHeader('Retry-After')).toBe('60');
    expect(res.getHeader('X-RateLimit-Remaining')).toBe('0');
  });
});

function response() {
  const headers = new Map();
  return {
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    getHeader(name) { return headers.get(name.toLowerCase()); },
  };
}
