import crypto from 'node:crypto';
import { enforceRateLimit } from '../_lib/rate-limit.js';

const EVENTS = new Set([
  'onboarding_viewed',
  'onboarding_primary_clicked',
  'onboarding_example_clicked',
  'onboarding_skipped',
  'onboarding_restore_started',
  'onboarding_restore_result',
  'onboarding_completed',
]);
const PROPERTY_ENUMS = {
  method: new Set(['first_task', 'drive_restore']),
  result: new Set(['success', 'empty', 'cancelled', 'offline', 'error']),
  exampleKind: new Set(['simple', 'scheduled', 'recurring']),
  elapsedBucket: new Set(['under_30s', '30_to_60s', '1_to_5m', 'over_5m']),
};
const redisScript = `
local inserted = redis.call('SET', KEYS[1], '1', 'EX', ARGV[1], 'NX')
if not inserted then return 0 end
redis.call('HINCRBY', KEYS[2], ARGV[2], 1)
redis.call('EXPIRE', KEYS[2], ARGV[3])
return 1
`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const contentLength = Number(req.headers['content-length'] || 0);
  if (contentLength > 2_048) return res.status(413).json({ error: 'Request too large.' });
  if (Buffer.byteLength(JSON.stringify(req.body ?? null), 'utf8') > 2_048) {
    return res.status(413).json({ error: 'Request too large.' });
  }

  try {
    await enforceRateLimit(req, res, {
      name: 'onboarding-analytics',
      limit: 30,
      windowSeconds: 600,
    });
    const event = validateEvent(req.body);
    const stored = await storeAggregate(event);
    if (!stored.available) return res.status(503).json({ error: 'Analytics unavailable.' });
    return res.status(204).end();
  } catch (error) {
    return res.status(error.statusCode || 400).json({ error: error.message || 'Invalid event.' });
  }
}

export function validateEvent(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw badRequest('Invalid JSON body.');
  const allowedKeys = new Set(['schemaVersion', 'eventId', 'event', 'platform', 'appVersion', 'onboardingVersion', 'properties']);
  if (Object.keys(body).some(key => !allowedKeys.has(key))) throw badRequest('Unknown event field.');
  if (body.schemaVersion !== 1 || body.onboardingVersion !== 2) throw badRequest('Unsupported analytics schema.');
  if (!isUuid(body.eventId)) throw badRequest('Invalid event ID.');
  if (!EVENTS.has(body.event)) throw badRequest('Unknown event.');
  if (!['web', 'android'].includes(body.platform)) throw badRequest('Invalid platform.');
  if (typeof body.appVersion !== 'string' || !/^[A-Za-z0-9._-]{1,32}$/.test(body.appVersion)) throw badRequest('Invalid app version.');
  const properties = body.properties ?? {};
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) throw badRequest('Invalid properties.');
  if (Object.keys(properties).some(key => !PROPERTY_ENUMS[key])) throw badRequest('Unknown property.');
  for (const [key, value] of Object.entries(properties)) {
    if (!PROPERTY_ENUMS[key].has(value)) throw badRequest(`Invalid ${key}.`);
  }
  return { ...body, properties };
}

async function storeAggregate(event) {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!redisUrl || !redisToken) return { available: false };
  const day = new Date().toISOString().slice(0, 10);
  const field = aggregateField(event);
  const response = await fetch(redisUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([
      'EVAL', redisScript, '2',
      `emberlist:analytics:dedupe:${event.eventId}`,
      `emberlist:analytics:onboarding:${day}:${event.platform}:v${event.onboardingVersion}`,
      String(30 * 24 * 60 * 60), field, String(400 * 24 * 60 * 60),
    ]),
    signal: AbortSignal.timeout(1_500),
  });
  if (!response.ok) return { available: false };
  return { available: true };
}

function aggregateField(event) {
  const suffix = Object.entries(event.properties)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('|');
  return suffix ? `${event.event}|${suffix}` : event.event;
}

function isUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

export function eventDigestForTests(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
