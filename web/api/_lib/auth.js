import crypto from 'node:crypto';

export const SESSION_COOKIE = '__Host-emberlist_session';
export const OAUTH_STATE_COOKIE = '__Host-emberlist_oauth_state';
export const SCOPES = 'openid email https://www.googleapis.com/auth/drive.appdata';

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const STATE_MAX_AGE_SECONDS = 60 * 10;

export function getConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  const cookieSecret = process.env.EMBERLIST_AUTH_SECRET || process.env.AUTH_COOKIE_SECRET || '';

  if (!clientId || !clientSecret || !cookieSecret) {
    const missing = [
      clientId ? null : 'GOOGLE_CLIENT_ID',
      clientSecret ? null : 'GOOGLE_CLIENT_SECRET',
      cookieSecret ? null : 'EMBERLIST_AUTH_SECRET',
    ].filter(Boolean);
    throw new Error(`Missing server auth configuration: ${missing.join(', ')}`);
  }

  return { clientId, clientSecret, cookieSecret };
}

export function getOrigin(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

export function redirect(res, location, statusCode = 302) {
  res.statusCode = statusCode;
  res.setHeader('Location', location);
  res.end();
}

export function json(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export function methodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed.join(', '));
  json(res, 405, { error: 'method_not_allowed' });
}

export function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};

  return Object.fromEntries(
    header
      .split(';')
      .map((cookie) => {
        const [name, ...valueParts] = cookie.trim().split('=');
        return [name, decodeURIComponent(valueParts.join('='))];
      })
      .filter(([name]) => name),
  );
}

export function appendSetCookie(res, cookie) {
  const current = res.getHeader('Set-Cookie');
  if (!current) {
    res.setHeader('Set-Cookie', cookie);
  } else if (Array.isArray(current)) {
    res.setHeader('Set-Cookie', [...current, cookie]);
  } else {
    res.setHeader('Set-Cookie', [current, cookie]);
  }
}

export function setEncryptedCookie(res, name, value, secret, maxAgeSeconds) {
  const encrypted = encryptJson(value, secret);
  appendSetCookie(
    res,
    `${name}=${encodeURIComponent(encrypted)}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Lax`,
  );
}

export function clearCookie(res, name) {
  appendSetCookie(
    res,
    `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
  );
}

export function readEncryptedCookie(req, name, secret) {
  const value = parseCookies(req)[name];
  if (!value) return null;
  return decryptJson(value, secret);
}

export function setSessionCookie(res, session, secret) {
  setEncryptedCookie(res, SESSION_COOKIE, session, secret, SESSION_MAX_AGE_SECONDS);
}

export function setStateCookie(res, state, secret) {
  setEncryptedCookie(res, OAUTH_STATE_COOKIE, state, secret, STATE_MAX_AGE_SECONDS);
}

export function clearAuthCookies(res) {
  clearCookie(res, SESSION_COOKIE);
  clearCookie(res, OAUTH_STATE_COOKIE);
}

export function readSession(req, secret) {
  const session = readEncryptedCookie(req, SESSION_COOKIE, secret);
  if (!session || typeof session.refreshToken !== 'string') return null;
  return {
    refreshToken: session.refreshToken,
    email: typeof session.email === 'string' ? session.email : null,
    name: typeof session.name === 'string' ? session.name : null,
    createdAt: typeof session.createdAt === 'number' ? session.createdAt : Date.now(),
  };
}

export function requireSession(req) {
  const { cookieSecret } = getConfig();
  const session = readSession(req, cookieSecret);
  if (!session) {
    const error = new Error('Google Drive sign-in is required.');
    error.statusCode = 401;
    throw error;
  }
  return session;
}

export function assertSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;
  if (origin !== getOrigin(req)) {
    const error = new Error('Cross-origin request rejected.');
    error.statusCode = 403;
    throw error;
  }
}

export function safeReturnTo(value) {
  if (typeof value !== 'string' || !value.trim()) return '/#/today';
  try {
    const decoded = decodeURIComponent(value);
    if (!decoded.startsWith('/') || decoded.startsWith('//')) return '/#/today';
    if (decoded.startsWith('/api/')) return '/#/today';
    return decoded;
  } catch {
    return '/#/today';
  }
}

export function buildGoogleAuthUrl({ origin, state }) {
  const { clientId } = getConfig();
  const params = new URLSearchParams({
    access_type: 'offline',
    client_id: clientId,
    include_granted_scopes: 'true',
    prompt: 'consent',
    redirect_uri: `${origin}/api/auth/google/callback`,
    response_type: 'code',
    scope: SCOPES,
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens({ code, origin }) {
  const { clientId, clientSecret } = getConfig();
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: `${origin}/api/auth/google/callback`,
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throwGoogleError('exchange authorization code', response.status, body);
  }
  if (typeof body.refresh_token !== 'string' || !body.refresh_token) {
    const error = new Error('Google did not return a refresh token. Reconnect and approve offline access.');
    error.statusCode = 400;
    throw error;
  }
  if (typeof body.access_token !== 'string' || !body.access_token) {
    const error = new Error('Google did not return an access token.');
    error.statusCode = 400;
    throw error;
  }
  return body;
}

export async function refreshAccessToken(refreshToken) {
  const { clientId, clientSecret } = getConfig();
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throwGoogleError('refresh Google access token', response.status, body);
  }
  if (typeof body.access_token !== 'string' || !body.access_token) {
    const error = new Error('Google did not return a refreshed access token.');
    error.statusCode = 401;
    throw error;
  }
  return body.access_token;
}

export async function fetchGoogleProfile(accessToken) {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return { email: null, name: null };
  const body = await response.json().catch(() => ({}));
  return {
    email: typeof body.email === 'string' ? body.email : null,
    name: typeof body.name === 'string' ? body.name : null,
  };
}

export async function revokeGoogleToken(token) {
  if (!token) return;
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
    method: 'POST',
  }).catch(() => undefined);
}

export function handleApiError(res, error) {
  const statusCode = typeof error?.statusCode === 'number' ? error.statusCode : 500;
  json(res, statusCode, {
    error: statusCode >= 500 ? 'server_error' : 'request_failed',
    message: error instanceof Error ? error.message : 'Request failed.',
  });
}

export function throwGoogleError(action, status, body) {
  const reason = body?.error_description || body?.error?.message || body?.error || '';
  const error = new Error(`Failed to ${action} (${status})${reason ? ` - ${reason}` : ''}`);
  error.statusCode = status === 401 ? 401 : 502;
  throw error;
}

function encryptJson(value, secret) {
  const key = deriveKey(secret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    base64url(iv),
    base64url(tag),
    base64url(encrypted),
  ].join('.');
}

function decryptJson(value, secret) {
  const [ivPart, tagPart, encryptedPart] = String(value).split('.');
  if (!ivPart || !tagPart || !encryptedPart) return null;
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    deriveKey(secret),
    fromBase64url(ivPart),
  );
  decipher.setAuthTag(fromBase64url(tagPart));
  const decrypted = Buffer.concat([
    decipher.update(fromBase64url(encryptedPart)),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString('utf8'));
}

function deriveKey(secret) {
  return crypto.createHash('sha256').update(secret).digest();
}

function base64url(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

function fromBase64url(value) {
  return Buffer.from(value, 'base64url');
}
