import crypto from 'node:crypto';
import { parseCookies, SESSION_COOKIE } from './auth.js';

const memoryBuckets = new Map();
const MAX_MEMORY_BUCKETS = 10_000;
const redisScript = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('TTL', KEYS[1])
return {current, ttl}
`;

export async function enforceRateLimit(req, res, {
  name,
  limit,
  windowSeconds,
  includeSession = false,
}) {
  const subjects = [`ip:${clientAddress(req)}`];
  if (includeSession) {
    const sessionCookie = parseCookies(req)[SESSION_COOKIE];
    if (sessionCookie) subjects.push(`session:${digest(sessionCookie)}`);
  }

  let mostRestrictive = null;
  for (const subject of subjects) {
    const result = await increment(`${name}:${digest(subject)}`, windowSeconds);
    const remaining = Math.max(0, limit - result.count);
    if (!mostRestrictive || remaining < mostRestrictive.remaining) {
      mostRestrictive = { ...result, remaining };
    }
    if (result.count > limit) {
      res.setHeader('Retry-After', String(result.resetSeconds));
      setRateLimitHeaders(res, limit, remaining, result.resetSeconds);
      const error = new Error('Too many requests. Please try again later.');
      error.statusCode = 429;
      throw error;
    }
  }

  setRateLimitHeaders(
    res,
    limit,
    mostRestrictive?.remaining ?? limit,
    mostRestrictive?.resetSeconds ?? windowSeconds,
  );
}

async function increment(key, windowSeconds) {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (redisUrl && redisToken) {
    try {
      const response = await fetch(redisUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${redisToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(['EVAL', redisScript, '1', `emberlist:rate:${key}`, String(windowSeconds)]),
        signal: AbortSignal.timeout(1_500),
      });
      if (!response.ok) throw new Error(`Rate-limit store returned ${response.status}.`);
      const body = await response.json();
      if (!Array.isArray(body.result) || body.result.length !== 2) throw new Error('Invalid rate-limit response.');
      const count = Number(body.result[0]);
      const ttl = Number(body.result[1]);
      if (!Number.isFinite(count) || !Number.isFinite(ttl)) throw new Error('Invalid rate-limit counters.');
      return { count, resetSeconds: Math.max(1, ttl) };
    } catch {
      // Keep a warm instance protected if the optional distributed store is unavailable.
    }
  }
  return incrementMemory(key, windowSeconds);
}

function incrementMemory(key, windowSeconds) {
  const now = Date.now();
  const existing = memoryBuckets.get(key);
  if (!existing || existing.resetAt <= now) {
    pruneMemory(now);
    const bucket = { count: 1, resetAt: now + windowSeconds * 1000 };
    memoryBuckets.set(key, bucket);
    return { count: bucket.count, resetSeconds: windowSeconds };
  }
  existing.count += 1;
  return {
    count: existing.count,
    resetSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

function pruneMemory(now) {
  for (const [key, bucket] of memoryBuckets) {
    if (bucket.resetAt <= now) memoryBuckets.delete(key);
  }
  while (memoryBuckets.size >= MAX_MEMORY_BUCKETS) {
    memoryBuckets.delete(memoryBuckets.keys().next().value);
  }
}

function clientAddress(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return value?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.socket?.remoteAddress
    || 'unknown';
}

function setRateLimitHeaders(res, limit, remaining, resetSeconds) {
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(Date.now() / 1000) + resetSeconds));
}

function digest(value) {
  return crypto.createHash('sha256').update(String(value)).digest('base64url').slice(0, 22);
}

export function resetRateLimitMemoryForTests() {
  memoryBuckets.clear();
}
