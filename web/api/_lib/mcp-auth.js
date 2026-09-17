import crypto from 'node:crypto';
import {
  fetchGoogleProfile,
  getConfig,
  getOrigin,
  setSessionCookie,
  throwGoogleError,
} from './auth.js';
import {
  findAccessToken,
  getGrantSecret,
  claimMutationReplay,
  completeMutationReplay,
  releaseMutationReplay,
  writeAuditEvent,
} from './mcp-db.js';

export const MCP_SCOPE = 'emberlist.workspace';
export const OFFLINE_SCOPE = 'offline_access';
export const ACCESS_TOKEN_SECONDS = 60 * 60;
export const REFRESH_TOKEN_SECONDS = 60 * 60 * 24 * 90;
export const GRANT_SECONDS = 60 * 60 * 24 * 365;
export const AUTHORIZATION_REQUEST_SECONDS = 5 * 60;
export const AUTHORIZATION_CODE_SECONDS = 5 * 60;
export const MCP_GOOGLE_STATE_COOKIE = '__Host-emberlist_mcp_oauth_state';

const PKCE_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/u;

export function getMcpConfig(req) {
  const origin = getOrigin(req);
  const authSecret = process.env.EMBERLIST_MCP_AUTH_SECRET || '';
  if (authSecret.length < 32) {
    const error = new Error('EMBERLIST_MCP_AUTH_SECRET must contain at least 32 characters.');
    error.statusCode = 503;
    throw error;
  }
  const resource = new URL('/api/mcp', origin).toString();
  return { authSecret, issuer: origin, resource };
}

export function assertMcpEnabled() {
  if (process.env.EMBERLIST_MCP_ENABLED !== 'true') {
    const error = new Error('Emberlist MCP is not enabled.');
    error.statusCode = 503;
    throw error;
  }
}

export function hashOpaqueToken(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function createOpaqueToken(prefix = '') {
  return `${prefix}${crypto.randomBytes(32).toString('base64url')}`;
}

export function encryptMcpSecret(value, secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
}

export function decryptMcpSecret(value, secret) {
  const [iv, tag, encrypted] = String(value).split('.');
  if (!iv || !tag || !encrypted) throw new Error('Invalid encrypted MCP secret.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(secret), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function validateClientRegistration(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw oauthError('invalid_client_metadata', 'A JSON object is required.');
  const clientName = cleanText(body.client_name, 100) || 'Codex';
  if (!Array.isArray(body.redirect_uris) || body.redirect_uris.length < 1 || body.redirect_uris.length > 10) {
    throw oauthError('invalid_redirect_uri', 'One to ten redirect_uris are required.');
  }
  const redirectUris = [...new Set(body.redirect_uris.map(validateRedirectUri))];
  if (body.token_endpoint_auth_method && body.token_endpoint_auth_method !== 'none') {
    throw oauthError('invalid_client_metadata', 'Only public clients are supported.');
  }
  if (body.grant_types && (!Array.isArray(body.grant_types)
    || body.grant_types.some((value) => !['authorization_code', 'refresh_token'].includes(value)))) {
    throw oauthError('invalid_client_metadata', 'Unsupported grant_types value.');
  }
  if (body.response_types && (!Array.isArray(body.response_types)
    || body.response_types.length !== 1 || body.response_types[0] !== 'code')) {
    throw oauthError('invalid_client_metadata', 'Only the code response type is supported.');
  }
  return { clientName, redirectUris };
}

export function validateClientId(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 200) {
    throw oauthError('invalid_client', 'client_id is invalid.', 401);
  }
  return value;
}

export function validateAuthorizationRequest(searchParams, { client, resource }) {
  if (searchParams.get('response_type') !== 'code') throw oauthError('unsupported_response_type', 'Only response_type=code is supported.');
  const redirectUri = searchParams.get('redirect_uri') || '';
  if (!client.redirect_uris.includes(redirectUri)) throw oauthError('invalid_request', 'redirect_uri is not registered for this client.');
  if (searchParams.get('code_challenge_method') !== 'S256') throw oauthError('invalid_request', 'S256 PKCE is required.');
  const codeChallenge = searchParams.get('code_challenge') || '';
  if (!/^[A-Za-z0-9_-]{43,128}$/u.test(codeChallenge)) throw oauthError('invalid_request', 'code_challenge is invalid.');
  if (searchParams.get('resource') !== resource) throw oauthError('invalid_target', 'resource must exactly match the Emberlist MCP resource.');
  const scopes = normalizeScopes(searchParams.get('scope'));
  if (!scopes.includes(MCP_SCOPE) || scopes.some((scope) => ![MCP_SCOPE, OFFLINE_SCOPE].includes(scope))) {
    throw oauthError('invalid_scope', `Supported scopes are ${MCP_SCOPE} and ${OFFLINE_SCOPE}.`);
  }
  const state = searchParams.get('state');
  if (!state || state.length > 512) throw oauthError('invalid_request', 'state is required and cannot exceed 512 characters.');
  return {
    redirectUri,
    state,
    scope: MCP_SCOPE,
    offlineAccess: scopes.includes(OFFLINE_SCOPE),
    resource,
    codeChallenge,
  };
}

export function verifyPkce(verifier, challenge) {
  if (!PKCE_PATTERN.test(String(verifier))) return false;
  const actual = crypto.createHash('sha256').update(verifier).digest('base64url');
  return safeEqual(actual, challenge);
}

export function validateTimeZone(value) {
  if (typeof value !== 'string' || !value || value.length > 100) throw requestError('A valid IANA time zone is required.');
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return value;
  } catch {
    throw requestError('A valid IANA time zone is required.');
  }
}

export function createTokenPair({ grantId, clientId, scope, resource, familyId = crypto.randomUUID(), now = Date.now() }) {
  const accessToken = createOpaqueToken('el_at_');
  const refreshToken = createOpaqueToken('el_rt_');
  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_SECONDS,
    accessRecord: {
      hash: hashOpaqueToken(accessToken), grantId, clientId, scope, resource,
      expiresAt: new Date(now + ACCESS_TOKEN_SECONDS * 1000),
    },
    refreshRecord: {
      hash: hashOpaqueToken(refreshToken), grantId, clientId, familyId, scope, resource,
      expiresAt: new Date(now + REFRESH_TOKEN_SECONDS * 1000),
    },
  };
}

export async function verifyMcpAccessToken(rawToken, now = Date.now()) {
  if (typeof rawToken !== 'string' || !rawToken) return null;
  const row = await findAccessToken(hashOpaqueToken(rawToken));
  if (!row || row.revoked_at || toMillis(row.expires_at) <= now || toMillis(row.grant_expires_at) <= now) return null;
  return {
    token: rawToken,
    clientId: row.client_id,
    scopes: normalizeScopes(row.scope),
    expiresAt: toMillis(row.expires_at),
    resource: row.resource,
    extra: {
      grantId: row.grant_id,
      accountId: row.account_id,
      timeZone: row.time_zone,
    },
  };
}

export async function getMcpGoogleRefreshToken(grantId, req, now = Date.now()) {
  const row = await getGrantSecret(grantId);
  if (!row || !row.encrypted_google_refresh_token || row.revoked_at || toMillis(row.expires_at) <= now) return null;
  return decryptMcpSecret(row.encrypted_google_refresh_token, getMcpConfig(req).authSecret);
}

export function bearerToken(req) {
  const header = req.headers.authorization;
  const match = typeof header === 'string' ? /^Bearer ([^\s]+)$/iu.exec(header) : null;
  return match?.[1] ?? null;
}

export async function exchangeMcpGoogleCode({ code, req }) {
  const { clientId, clientSecret } = getConfig();
  const { issuer } = getMcpConfig(req);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: `${issuer}/api/mcp/oauth/google/callback`,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throwGoogleError('exchange MCP Google authorization code', response.status, body);
  if (typeof body.refresh_token !== 'string' || !body.refresh_token
    || typeof body.access_token !== 'string' || !body.access_token) {
    throw requestError('Google did not return the credentials needed for Emberlist sync.');
  }
  return body;
}

export async function establishMcpGoogleSession({ code, req, res }) {
  const tokens = await exchangeMcpGoogleCode({ code, req });
  const profile = await fetchGoogleProfile(tokens.access_token);
  if (!profile.accountId || !profile.email || !profile.emailVerified) {
    throw requestError('Google did not return a verified account identity.');
  }
  const { cookieSecret } = getConfig();
  setSessionCookie(res, {
    refreshToken: tokens.refresh_token,
    accountId: profile.accountId,
    email: profile.email,
    name: profile.name,
    createdAt: Date.now(),
  }, cookieSecret);
  return profile;
}

export function buildMcpGoogleAuthUrl({ req, state }) {
  const { clientId } = getConfig();
  const { issuer } = getMcpConfig(req);
  return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
    access_type: 'offline',
    client_id: clientId,
    include_granted_scopes: 'true',
    prompt: 'consent',
    redirect_uri: `${issuer}/api/mcp/oauth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile https://www.googleapis.com/auth/drive.appdata',
    state,
  })}`;
}

export async function claimMcpMutation(grantId, mutationId, requestHash) {
  const mutationIdHash = hashOpaqueToken(mutationId);
  const row = await claimMutationReplay(grantId, mutationIdHash, requestHash);
  if (!row) throw requestError('Could not claim mutation.');
  if (!safeEqual(row.request_hash, requestHash)) {
    const error = new Error('mutationId was already used with different arguments.');
    error.statusCode = 409;
    throw error;
  }
  if (row.claimed) return { status: 'claimed' };
  if (row.status === 'completed') return { status: 'replay', result: row.result_identifiers };
  return { status: 'in_progress' };
}

export async function completeMcpMutation(grantId, mutationId, requestHash, resultIdentifiers) {
  return completeMutationReplay(grantId, hashOpaqueToken(mutationId), requestHash, resultIdentifiers);
}

export async function releaseMcpMutation(grantId, mutationId, requestHash) {
  return releaseMutationReplay(grantId, hashOpaqueToken(mutationId), requestHash);
}

export function hashMcpMutation(value) {
  return hashOpaqueToken(JSON.stringify(sortJson(value)));
}

export function oauthError(error, description, statusCode = 400) {
  const value = new Error(description);
  value.oauthError = error;
  value.statusCode = statusCode;
  return value;
}

export function oauthJson(res, statusCode, error, description) {
  res.statusCode = statusCode;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ error, ...(description ? { error_description: description } : {}) }));
}

export async function handleMcpOAuthError(res, error) {
  const statusCode = error?.statusCode ?? 500;
  try { await writeAuditEvent(failureEventName(error)); } catch { /* Best effort. */ }
  oauthJson(res, statusCode, error?.oauthError ?? 'server_error', statusCode >= 500
    ? 'OAuth request failed.'
    : error instanceof Error ? error.message : 'Request failed.');
}

export function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const contentType = String(req.headers['content-type'] || '');
  if (typeof req.body !== 'string' && !Buffer.isBuffer(req.body)) return {};
  const raw = String(req.body);
  if (contentType.includes('application/json')) {
    try { return JSON.parse(raw); } catch { throw oauthError('invalid_request', 'Request body must be valid JSON.'); }
  }
  return Object.fromEntries(new URLSearchParams(raw));
}

export function redirectWithOAuthResult(res, request, values) {
  const url = new URL(request.redirect_uri);
  for (const [key, value] of Object.entries({ ...values, state: request.state })) {
    if (value != null) url.searchParams.set(key, value);
  }
  res.statusCode = 302;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Location', url.toString());
  res.end();
}

export function toMillis(value) {
  const result = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(result) ? result : 0;
}

function validateRedirectUri(value) {
  if (typeof value !== 'string' || value.length > 2048) throw oauthError('invalid_redirect_uri', 'redirect_uris must contain URLs no longer than 2048 characters.');
  let url;
  try { url = new URL(value); } catch { throw oauthError('invalid_redirect_uri', 'redirect_uri is invalid.'); }
  const loopback = url.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !loopback) || url.username || url.password || url.hash) {
    throw oauthError('invalid_redirect_uri', 'redirect_uri must use HTTPS or an HTTP loopback address and cannot contain credentials or a fragment.');
  }
  return url.toString();
}

function normalizeScopes(value) {
  return [...new Set(String(value || '').trim().split(/\s+/u).filter(Boolean))];
}

function cleanText(value, maxLength) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : null;
}

function requestError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function deriveKey(secret) {
  return crypto.createHash('sha256').update(secret).digest();
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJson(value[key])]));
}

function failureEventName(error) {
  if (['invalid_client_metadata', 'invalid_redirect_uri'].includes(error?.oauthError)) return 'mcp_registration_failure';
  if (error?.oauthError === 'invalid_target') return 'mcp_audience_failure';
  if (['invalid_grant', 'invalid_client'].includes(error?.oauthError)) return 'mcp_token_failure';
  if (error?.oauthError) return 'mcp_authorization_failure';
  return 'mcp_oauth_failure';
}
