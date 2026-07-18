import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import callbackHandler from '../../api/auth/google/callback.js';
import startHandler from '../../api/auth/google/start.js';
import {
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  STATE_MAX_AGE_SECONDS,
  readOAuthState,
  readSession,
  safeReturnTo,
  setSessionCookie,
  setStateCookie,
} from '../../api/_lib/auth.js';
import { resetRateLimitMemoryForTests } from '../../api/_lib/rate-limit.js';

const originalEnvironment = { ...process.env };
const secret = 'test-secret-with-enough-entropy-for-tests';

beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = 'test-client';
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
  process.env.EMBERLIST_AUTH_SECRET = secret;
  process.env.EMBERLIST_APP_ORIGIN = 'https://emberlist.test';
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  resetRateLimitMemoryForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...originalEnvironment };
});

describe('safeReturnTo', () => {
  it('keeps canonical same-origin application paths', () => {
    expect(safeReturnTo('/#/settings?tab=sync', 'https://emberlist.test'))
      .toBe('/#/settings?tab=sync');
  });

  it.each([
    '//evil.example/',
    '/\\evil.example/',
    '/%5Cevil.example/',
    '/%255Cevil.example/',
    'https://evil.example/',
    '/api/auth/session',
  ])('rejects unsafe return destination %s', (returnTo) => {
    expect(safeReturnTo(returnTo, 'https://emberlist.test')).toBe('/#/today');
  });
});

describe('encrypted cookie lifetimes', () => {
  it('accepts a current session and rejects missing, expired, and future creation times', () => {
    const now = 2_000_000_000_000;
    expect(readSession(cookieRequest(setSession({ refreshToken: 'token', createdAt: now })), secret, now))
      .toMatchObject({ refreshToken: 'token', createdAt: now });
    expect(readSession(cookieRequest(setSession({ refreshToken: 'token' })), secret, now)).toBeNull();
    expect(readSession(cookieRequest(setSession({
      refreshToken: 'token',
      createdAt: now - SESSION_MAX_AGE_SECONDS * 1000 - 1,
    })), secret, now)).toBeNull();
    expect(readSession(cookieRequest(setSession({ refreshToken: 'token', createdAt: now + 1 })), secret, now))
      .toBeNull();
  });

  it('accepts current OAuth state and rejects expired and future state', () => {
    const now = 2_000_000_000_000;
    const current = { nonce: 'nonce', returnTo: '/#/today', createdAt: now };
    expect(readOAuthState(cookieRequest(setState(current)), secret, now)).toEqual(current);
    expect(readOAuthState(cookieRequest(setState({
      ...current,
      createdAt: now - STATE_MAX_AGE_SECONDS * 1000 - 1,
    })), secret, now)).toBeNull();
    expect(readOAuthState(cookieRequest(setState({ ...current, createdAt: now + 1 })), secret, now))
      .toBeNull();
  });

  it('treats malformed encrypted cookies as unauthenticated', () => {
    expect(readSession(cookieRequest(`${SESSION_COOKIE}=not-valid`), secret)).toBeNull();
  });
});

describe('OAuth endpoints', () => {
  it('stores the fallback path for a percent-encoded backslash return destination', async () => {
    const req = request('GET', '/api/auth/google/start?returnTo=%2F%255Cevil.example');
    const res = response();

    await startHandler(req, res);

    const state = readOAuthState(cookieRequest(cookiePair(res, OAUTH_STATE_COOKIE)), secret);
    expect(state?.returnTo).toBe('/#/today');
    expect(res.statusCode).toBe(302);
    expect(res.getHeader('Location')).toMatch(/^https:\/\/accounts\.google\.com\//);
    expect(res.getHeader('Cache-Control')).toBe('no-store');
  });

  it('rejects an expired callback state before making a token request', async () => {
    const expired = {
      nonce: 'nonce',
      returnTo: '/#/settings',
      createdAt: Date.now() - STATE_MAX_AGE_SECONDS * 1000 - 1,
    };
    const req = request('GET', '/api/auth/google/callback?state=nonce&code=code');
    req.headers.cookie = setState(expired);
    const res = response();

    await callbackHandler(req, res);

    expect(res.statusCode).toBe(302);
    expect(res.getHeader('Location')).toBe('/#/settings?syncError=state_mismatch');
  });

  it('rejects a callback state mismatch without making a token request', async () => {
    const req = request('GET', '/api/auth/google/callback?state=wrong&code=code');
    req.headers.cookie = setState({
      nonce: 'expected',
      returnTo: '/#/settings',
      createdAt: Date.now(),
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = response();

    await callbackHandler(req, res);

    expect(res.getHeader('Location')).toBe('/#/settings?syncError=state_mismatch');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sets a session and safely redirects after a valid callback', async () => {
    const req = request('GET', '/api/auth/google/callback?state=nonce&code=code');
    req.headers.cookie = setState({
      nonce: 'nonce',
      returnTo: '/#/settings',
      createdAt: Date.now(),
    });
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'access',
        refresh_token: 'refresh',
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        email: 'friend@example.test',
        name: 'Friend',
      }), { status: 200 })));
    const res = response();

    await callbackHandler(req, res);

    expect(res.getHeader('Location')).toBe('/#/settings?googleAuth=connected');
    expect(cookiePair(res, SESSION_COOKIE)).toMatch(new RegExp(`^${SESSION_COOKIE}=`));
    expect(readSession(cookieRequest(cookiePair(res, SESSION_COOKIE)), secret))
      .toMatchObject({ refreshToken: 'refresh', email: 'friend@example.test' });
  });
});

function setSession(value) {
  const res = response();
  setSessionCookie(res, value, secret);
  return cookiePair(res, SESSION_COOKIE);
}

function setState(value) {
  const res = response();
  setStateCookie(res, value, secret);
  return cookiePair(res, OAUTH_STATE_COOKIE);
}

function cookiePair(res, name) {
  const headers = [res.getHeader('Set-Cookie')].flat();
  return headers.find((header) => header.startsWith(`${name}=`)).split(';')[0];
}

function cookieRequest(cookie) {
  return { headers: { cookie } };
}

function request(method, url) {
  return {
    method,
    url,
    headers: {
      host: 'emberlist.test',
      'x-forwarded-for': '192.0.2.1',
      'x-forwarded-host': 'emberlist.test',
      'x-forwarded-proto': 'https',
    },
  };
}

function response() {
  const headers = new Map();
  return {
    statusCode: 200,
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
    },
    getHeader(name) {
      return headers.get(name.toLowerCase());
    },
    end() {},
  };
}
