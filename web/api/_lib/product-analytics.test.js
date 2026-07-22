import { afterEach, describe, expect, it, vi } from 'vitest';
import { featuresForEvent, hashInstallId, storeV2Event, validateV2Event } from './product-analytics.js';

const base = {
  schemaVersion: 2,
  eventId: '123e4567-e89b-42d3-a456-426614174000',
  installId: '123e4567-e89b-42d3-a456-426614174111',
  occurredAt: '2026-07-21T12:00:00.000Z',
  event: 'task_create_result', platform: 'web', appVersion: '1.2.3',
  properties: { result: 'success', recurring: true, bulk: false },
};
const now = Date.parse('2026-07-21T12:01:00.000Z');

afterEach(() => vi.unstubAllGlobals());

describe('schema-v2 product analytics', () => {
  it('accepts typed allowlisted properties and rejects content or unknown fields', () => {
    expect(validateV2Event(base, now).properties.recurring).toBe(true);
    expect(() => validateV2Event({ ...base, properties: { ...base.properties, title: 'private task' } }, now)).toThrow('Unknown property');
    expect(() => validateV2Event({ ...base, googleEmail: 'person@example.com' }, now)).toThrow('Invalid event fields');
    expect(() => validateV2Event({ ...base, properties: { result: 'success', recurring: 'true' } }, now)).toThrow('Invalid recurring');
  });

  it('rejects future, expired, and invalid event combinations', () => {
    expect(() => validateV2Event({ ...base, occurredAt: '2026-07-21T12:02:01.000Z' }, now)).toThrow('timestamp');
    expect(() => validateV2Event({ ...base, occurredAt: '2026-07-13T12:00:00.000Z' }, now)).toThrow('timestamp');
    expect(() => validateV2Event({ ...base, event: 'screen_viewed', properties: {} }, now)).toThrow('Missing required');
    expect(() => validateV2Event({ ...base, properties: { result: 'success', errorCategory: 'network' } }, now)).toThrow('requires a failure');
  });

  it('HMACs install IDs and never sends the raw ID to Redis', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: 1 }) });
    vi.stubGlobal('fetch', fetchMock);
    const env = { ANALYTICS_ID_SECRET: 'a'.repeat(32), UPSTASH_REDIS_REST_URL: 'https://redis.example', UPSTASH_REDIS_REST_TOKEN: 'token' };
    const stored = await storeV2Event(validateV2Event(base, now), env);
    expect(stored.installHash).toBe(hashInstallId(base.installId, env.ANALYTICS_ID_SECRET));
    const redisBody = JSON.stringify(JSON.parse(fetchMock.mock.calls[0][1].body));
    expect(redisBody).not.toContain(base.installId);
    expect(redisBody).toContain(stored.installHash);
  });

  it('maps only aggregate feature flags', () => {
    expect(featuresForEvent(base)).toEqual(['recurrence']);
    expect(featuresForEvent({ ...base, event: 'project_created', properties: {} })).toEqual(['projects']);
  });
});
