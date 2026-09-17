import crypto from 'node:crypto';
import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  approveAuthorizationRequest: vi.fn(),
  claimMutationReplay: vi.fn(),
  completeMutationReplay: vi.fn(),
  cleanupMcpDatabase: vi.fn(),
  consumeAuthorizationCodeAndIssue: vi.fn(),
  createAuthorizationRequest: vi.fn(),
  denyAuthorizationRequest: vi.fn(),
  findAccessToken: vi.fn(),
  getAuthorizationCode: vi.fn(),
  getAuthorizationRequest: vi.fn(),
  getGrantSecret: vi.fn(),
  getOAuthClient: vi.fn(),
  getRefreshToken: vi.fn(),
  listGrantsForAccount: vi.fn(),
  registerOAuthClient: vi.fn(),
  releaseMutationReplay: vi.fn(),
  revokeGrant: vi.fn(),
  revokeGrantForTokenHash: vi.fn(),
  revokeAllMcpGrants: vi.fn(),
  rotateRefreshToken: vi.fn(),
  updateGrantTimeZone: vi.fn(),
  writeAuditEvent: vi.fn(),
}));

vi.mock('../../api/_lib/mcp-db.js', () => db);
vi.mock('../../api/_lib/rate-limit.js', () => ({ enforceRateLimit: vi.fn() }));

import { setSessionCookie } from '../../api/_lib/auth.js';
import { hashOpaqueToken } from '../../api/_lib/mcp-auth.js';
import authorizationMetadata from '../../server/mcp/oauth/authorization-server.js';
import authorize from '../../server/mcp/oauth/authorize.js';
import cleanup from '../../server/mcp/cleanup.js';
import googleCallback from '../../server/mcp/oauth/google/callback.js';
import grants from '../../server/mcp/grants.js';
import protectedResourceMetadata from '../../server/mcp/oauth/protected-resource.js';
import register from '../../server/mcp/oauth/register.js';
import revoke from '../../server/mcp/oauth/revoke.js';
import token from '../../server/mcp/oauth/token.js';

const originalEnvironment = { ...process.env };
const cookieSecret = 'web-cookie-secret-with-at-least-32-characters';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.EMBERLIST_APP_ORIGIN = 'https://emberlist.test';
  process.env.EMBERLIST_AUTH_SECRET = cookieSecret;
  process.env.EMBERLIST_MCP_AUTH_SECRET = 'mcp-secret-with-at-least-32-characters';
  process.env.EMBERLIST_MCP_ENABLED = 'true';
  process.env.GOOGLE_CLIENT_ID = 'google-client';
  process.env.GOOGLE_CLIENT_SECRET = 'google-secret';
});

afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe('MCP OAuth discovery and registration', () => {
  it('publishes protected-resource and authorization-server metadata', () => {
    const protectedResponse = response();
    protectedResourceMetadata(request('GET', '/.well-known/oauth-protected-resource'), protectedResponse);
    expect(JSON.parse(protectedResponse.body)).toMatchObject({
      resource: 'https://emberlist.test/api/mcp',
      authorization_servers: ['https://emberlist.test'],
      scopes_supported: ['emberlist.workspace'],
    });

    const serverResponse = response();
    authorizationMetadata(request('GET', '/.well-known/oauth-authorization-server'), serverResponse);
    expect(JSON.parse(serverResponse.body)).toMatchObject({
      issuer: 'https://emberlist.test',
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
    });
    expect(JSON.parse(serverResponse.body)).not.toHaveProperty('authorization_response_iss_parameter_supported');
  });

  it('routes both RFC protected-resource discovery forms', () => {
    const vercel = JSON.parse(fs.readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
    expect(vercel.rewrites).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: '/.well-known/oauth-protected-resource' }),
      expect.objectContaining({ source: '/.well-known/oauth-protected-resource/api/mcp' }),
    ]));
  });

  it('routes every MCP public URL through the existing Drive serverless function', () => {
    const vercel = JSON.parse(fs.readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
    const mcpRoutes = vercel.rewrites.filter(rewrite => rewrite.source.startsWith('/api/mcp')
      || rewrite.source === '/api/internal/mcp-cleanup');
    expect(mcpRoutes).toHaveLength(10);
    expect(mcpRoutes.every(rewrite => rewrite.destination.startsWith('/api/drive/sync-file?mcp_route='))).toBe(true);
  });

  it('registers a public client without issuing a client secret', async () => {
    db.registerOAuthClient.mockResolvedValue({
      client_id: 'el_client_test',
      client_name: 'Codex',
      redirect_uris: ['http://127.0.0.1:4567/callback'],
      created_at: new Date('2026-08-21T00:00:00Z'),
    });
    const req = request('POST', '/api/mcp/oauth/register', {
      client_name: 'Codex',
      redirect_uris: ['http://127.0.0.1:4567/callback'],
      token_endpoint_auth_method: 'none',
    });
    const res = response();

    await register(req, res);

    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body)).toMatchObject({ client_id: 'el_client_test', token_endpoint_auth_method: 'none' });
    expect(JSON.parse(res.body)).not.toHaveProperty('client_secret');
  });

  it('records registration failures without exposing server exception details', async () => {
    db.registerOAuthClient.mockRejectedValue(new Error('password authentication failed for database secret-host'));
    const res = response();
    await register(request('POST', '/api/mcp/oauth/register', {
      client_name: 'Codex', redirect_uris: ['https://client.test/callback'],
    }), res);
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error_description).toBe('OAuth request failed.');
    expect(res.body).not.toContain('secret-host');
    expect(db.writeAuditEvent).toHaveBeenCalledWith('mcp_oauth_failure');
  });
});

describe('MCP authorization and tokens', () => {
  it('escapes client and account text in consent and stores only the application scope', async () => {
    db.getOAuthClient.mockResolvedValue({
      client_id: 'client', client_name: '<img src=x onerror=alert(1)>',
      redirect_uris: ['http://127.0.0.1:4567/callback/codex'],
    });
    const verifier = 'a'.repeat(43);
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const query = new URLSearchParams({
      client_id: 'client', redirect_uri: 'http://127.0.0.1:4567/callback/codex', response_type: 'code',
      code_challenge: challenge, code_challenge_method: 'S256', resource: 'https://emberlist.test/api/mcp',
      scope: 'emberlist.workspace offline_access', state: 'csrf-state',
    });
    const req = request('GET', `/api/mcp/oauth/authorize?${query}`);
    req.headers.cookie = sessionCookie({ email: '<script>alert(1)</script>' });
    const res = response();

    await authorize(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(res.body).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(res.body).not.toContain('<img src=x');
    expect(res.getHeader('Content-Security-Policy')).toContain("form-action 'self' http://127.0.0.1:4567");
    expect(db.createAuthorizationRequest).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'emberlist.workspace', offlineAccess: true, state: 'csrf-state',
    }));
  });

  it('approves a form submission and redirects to the registered loopback callback', async () => {
    const authorizationRequest = {
      id: 'request', redirect_uri: 'http://127.0.0.1:4567/callback/codex', state: 'csrf-state',
      scope: 'emberlist.workspace', client_id: 'client', offline_access: true,
      resource: 'https://emberlist.test/api/mcp', code_challenge: 'challenge',
      expires_at: new Date(Date.now() + 60_000), approved_at: null, denied_at: null,
    };
    db.getAuthorizationRequest.mockResolvedValue(authorizationRequest);
    db.approveAuthorizationRequest.mockResolvedValue(authorizationRequest);
    const req = request('POST', '/api/mcp/oauth/authorize', 'request_id=request&decision=allow&time_zone=America%2FPhoenix');
    req.headers['content-type'] = 'application/x-www-form-urlencoded';
    req.headers.cookie = sessionCookie({ email: 'friend@example.test' });
    const res = response();

    await authorize(req, res);

    const location = new URL(res.getHeader('Location'));
    expect(res.statusCode).toBe(302);
    expect(location.origin + location.pathname).toBe('http://127.0.0.1:4567/callback/codex');
    expect(location.searchParams.get('code')).toMatch(/^el_code_/u);
    expect(location.searchParams.get('state')).toBe('csrf-state');
    expect(location.searchParams.has('iss')).toBe(false);
    expect(db.approveAuthorizationRequest).toHaveBeenCalledWith(expect.objectContaining({
      requestId: 'request', grant: expect.objectContaining({ timeZone: 'America/Phoenix' }),
    }));
  });

  it('exchanges an authorization code once and hashes all persisted tokens', async () => {
    const verifier = 'a'.repeat(43);
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    db.getOAuthClient.mockResolvedValue({ client_id: 'client' });
    db.getAuthorizationCode.mockResolvedValue({
      code_hash: hashOpaqueToken('raw-code'), grant_id: 'grant', client_id: 'client',
      redirect_uri: 'https://client.test/callback', code_challenge: challenge,
      scope: 'emberlist.workspace', offline_access: true, resource: 'https://emberlist.test/api/mcp',
      expires_at: new Date(Date.now() + 60_000), grant_expires_at: new Date(Date.now() + 60_000),
      consumed_at: null, revoked_at: null,
    });
    db.consumeAuthorizationCodeAndIssue.mockResolvedValue({ grant_id: 'grant' });
    const req = request('POST', '/api/mcp/oauth/token', {
      grant_type: 'authorization_code', client_id: 'client', code: 'raw-code', code_verifier: verifier,
      redirect_uri: 'https://client.test/callback', resource: 'https://emberlist.test/api/mcp',
    });
    const res = response();

    await token(req, res);

    const body = JSON.parse(res.body);
    expect(body).toMatchObject({ token_type: 'Bearer', expires_in: 3600, scope: 'emberlist.workspace' });
    expect(body.refresh_token).toMatch(/^el_rt_/u);
    const [, accessRecord, refreshRecord] = db.consumeAuthorizationCodeAndIssue.mock.calls[0];
    expect(accessRecord.hash).toBe(hashOpaqueToken(body.access_token));
    expect(refreshRecord.hash).toBe(hashOpaqueToken(body.refresh_token));
    expect(JSON.stringify(db.consumeAuthorizationCodeAndIssue.mock.calls[0])).not.toContain(body.access_token);
  });

  it('does not issue a refresh token without the protocol offline_access scope', async () => {
    const verifier = 'a'.repeat(43);
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    db.getOAuthClient.mockResolvedValue({ client_id: 'client' });
    db.getAuthorizationCode.mockResolvedValue({
      grant_id: 'grant', client_id: 'client', redirect_uri: 'https://client.test/callback',
      code_challenge: challenge, scope: 'emberlist.workspace', offline_access: false,
      resource: 'https://emberlist.test/api/mcp', expires_at: new Date(Date.now() + 60_000),
      grant_expires_at: new Date(Date.now() + 60_000), consumed_at: null, revoked_at: null,
    });
    db.consumeAuthorizationCodeAndIssue.mockResolvedValue({ grant_id: 'grant' });
    const res = response();
    await token(request('POST', '/api/mcp/oauth/token', {
      grant_type: 'authorization_code', client_id: 'client', code: 'code', code_verifier: verifier,
      redirect_uri: 'https://client.test/callback', resource: 'https://emberlist.test/api/mcp',
    }), res);
    expect(JSON.parse(res.body)).not.toHaveProperty('refresh_token');
    expect(db.consumeAuthorizationCodeAndIssue.mock.calls[0][2]).toBeNull();
  });

  it('rejects consumed codes and exact client, redirect, or resource mismatches', async () => {
    const verifier = 'a'.repeat(43);
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    db.getOAuthClient.mockResolvedValue({ client_id: 'client' });
    const validCode = {
      grant_id: 'grant', client_id: 'client', redirect_uri: 'https://client.test/callback',
      code_challenge: challenge, scope: 'emberlist.workspace', offline_access: false,
      resource: 'https://emberlist.test/api/mcp', expires_at: new Date(Date.now() + 60_000),
      grant_expires_at: new Date(Date.now() + 60_000), consumed_at: null, revoked_at: null,
    };
    for (const [row, bodyOverride] of [
      [{ ...validCode, consumed_at: new Date() }, {}],
      [{ ...validCode, client_id: 'different-client' }, {}],
      [validCode, { redirect_uri: 'https://client.test/other' }],
      [validCode, { resource: 'https://emberlist.test/api/mcp/' }],
    ]) {
      vi.clearAllMocks();
      db.getOAuthClient.mockResolvedValue({ client_id: 'client' });
      db.getAuthorizationCode.mockResolvedValue(row);
      const res = response();
      await token(request('POST', '/api/mcp/oauth/token', {
        grant_type: 'authorization_code', client_id: 'client', code: 'code', code_verifier: verifier,
        redirect_uri: 'https://client.test/callback', resource: 'https://emberlist.test/api/mcp',
        ...bodyOverride,
      }), res);
      expect(JSON.parse(res.body).error).toBe('invalid_grant');
      expect(db.consumeAuthorizationCodeAndIssue).not.toHaveBeenCalled();
    }
  });

  it('redirects valid-client authorization errors with exact state', async () => {
    db.getOAuthClient.mockResolvedValue({
      client_id: 'client', client_name: 'Codex', redirect_uris: ['https://client.test/callback'],
    });
    const query = new URLSearchParams({
      client_id: 'client', redirect_uri: 'https://client.test/callback', response_type: 'token',
      state: 'csrf-state', resource: 'https://emberlist.test/api/mcp', scope: 'emberlist.workspace',
    });
    const res = response();
    await authorize(request('GET', `/api/mcp/oauth/authorize?${query}`), res);
    const location = new URL(res.getHeader('Location'));
    expect(location.origin + location.pathname).toBe('https://client.test/callback');
    expect(location.searchParams.get('state')).toBe('csrf-state');
    expect(location.searchParams.has('iss')).toBe(false);
    expect(location.searchParams.get('error')).toBe('unsupported_response_type');
  });

  it('revokes the whole grant when a rotated refresh token is reused', async () => {
    db.getOAuthClient.mockResolvedValue({ client_id: 'client' });
    db.getRefreshToken.mockResolvedValue({
      client_id: 'client', grant_id: 'grant', family_id: 'family', scope: 'emberlist.workspace',
      resource: 'https://emberlist.test/api/mcp', expires_at: new Date(Date.now() + 60_000),
      grant_expires_at: new Date(Date.now() + 60_000), consumed_at: new Date(), revoked_at: null,
    });
    db.revokeGrant.mockResolvedValue({ id: 'grant' });
    const res = response();

    await token(request('POST', '/api/mcp/oauth/token', {
      grant_type: 'refresh_token', client_id: 'client', refresh_token: 'used-token',
      resource: 'https://emberlist.test/api/mcp',
    }), res);

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('invalid_grant');
    expect(db.revokeGrant).toHaveBeenCalledWith('grant');
    expect(db.writeAuditEvent).toHaveBeenCalledWith('mcp_refresh_token_reuse', expect.any(Object));
  });

  it('rotates a refresh token in the same family', async () => {
    db.getOAuthClient.mockResolvedValue({ client_id: 'client' });
    db.getRefreshToken.mockResolvedValue({
      client_id: 'client', grant_id: 'grant', family_id: 'family', scope: 'emberlist.workspace',
      resource: 'https://emberlist.test/api/mcp', expires_at: new Date(Date.now() + 60_000),
      grant_expires_at: new Date(Date.now() + 60_000), consumed_at: null, revoked_at: null,
    });
    db.rotateRefreshToken.mockResolvedValue({ token_hash: 'old' });
    const res = response();

    await token(request('POST', '/api/mcp/oauth/token', {
      grant_type: 'refresh_token', client_id: 'client', refresh_token: 'current-token',
      resource: 'https://emberlist.test/api/mcp',
    }), res);

    const body = JSON.parse(res.body);
    expect(body.refresh_token).toMatch(/^el_rt_/u);
    expect(db.rotateRefreshToken.mock.calls[0][2]).toMatchObject({ familyId: 'family' });
  });

  it('revokes by opaque token without requiring the MCP feature flag', async () => {
    process.env.EMBERLIST_MCP_ENABLED = 'false';
    db.revokeGrantForTokenHash.mockResolvedValue({ id: 'grant', client_id: 'client' });
    const res = response();
    await revoke(request('POST', '/api/mcp/oauth/revoke', { token: 'opaque-token' }), res);
    expect(res.statusCode).toBe(200);
    expect(db.revokeGrantForTokenHash).toHaveBeenCalledWith(hashOpaqueToken('opaque-token'));
  });

  it('blocks Google callback exchanges while the MCP feature is disabled', async () => {
    process.env.EMBERLIST_MCP_ENABLED = 'false';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = response();
    await googleCallback(request('GET', '/api/mcp/oauth/google/callback?state=x&code=y'), res);
    expect(res.statusCode).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('MCP cleanup', () => {
  it('requires the cron secret and returns content-free cleanup counts', async () => {
    process.env.CRON_SECRET = 'cron-secret';
    db.cleanupMcpDatabase.mockResolvedValue({ refreshTokens: 2, auditEvents: 3 });
    const unauthorized = response();
    await cleanup(request('GET', '/api/internal/mcp-cleanup'), unauthorized);
    expect(unauthorized.statusCode).toBe(401);

    const req = request('GET', '/api/internal/mcp-cleanup');
    req.headers.authorization = 'Bearer cron-secret';
    const authorized = response();
    await cleanup(req, authorized);
    expect(JSON.parse(authorized.body)).toEqual({ cleaned: { refreshTokens: 2, auditEvents: 3 } });
  });

  it('supports an authenticated bulk-revoke rollback', async () => {
    process.env.CRON_SECRET = 'cron-secret';
    db.revokeAllMcpGrants.mockResolvedValue(7);
    const req = request('DELETE', '/api/internal/mcp-cleanup');
    req.headers.authorization = 'Bearer cron-secret';
    const res = response();
    await cleanup(req, res);
    expect(JSON.parse(res.body)).toEqual({ revokedGrants: 7 });
  });

  it('hard-deletes expired, revoked, and tokenless grants while retaining consumed refresh hashes until expiry', () => {
    const source = fs.readFileSync(new URL('../../api/_lib/mcp-db.js', import.meta.url), 'utf8');
    expect(source).toContain('DELETE FROM mcp_oauth_grants grant_row');
    expect(source).toContain('grant_row.expires_at < CURRENT_TIMESTAMP');
    expect(source).toContain('grant_row.revoked_at IS NOT NULL');
    expect(source).toContain('NOT EXISTS (');
    expect(source).toContain('mcp_oauth_refresh_tokens refresh');
    expect(source).toContain('DELETE FROM mcp_oauth_refresh_tokens WHERE expires_at < CURRENT_TIMESTAMP');
    expect(source).not.toMatch(/mcp_oauth_refresh_tokens[^\n]*consumed_at/u);
    expect(source).toContain("client.created_at < CURRENT_TIMESTAMP - INTERVAL '30 days'");
    expect(source).toContain('NOT EXISTS (SELECT 1 FROM mcp_oauth_grants grant_row WHERE grant_row.client_id = client.client_id)');
  });
});

describe('connected MCP grants', () => {
  it('returns the Settings contract with numeric timestamps', async () => {
    db.listGrantsForAccount.mockResolvedValue([{
      id: 'grant', client_name: 'Codex', created_at: new Date('2026-01-01T00:00:00Z'),
      last_used_at: null, expires_at: new Date('2027-01-01T00:00:00Z'), time_zone: 'America/Phoenix',
    }]);
    const req = request('GET', '/api/mcp/grants');
    req.headers.cookie = sessionCookie({ email: 'friend@example.test' });
    const res = response();

    await grants(req, res);

    expect(JSON.parse(res.body)).toEqual({ grants: [{
      id: 'grant', clientName: 'Codex', createdAt: 1767225600000, lastUsedAt: null,
      expiresAt: 1798761600000, timeZone: 'America/Phoenix',
    }] });
  });

  it('does not expose database errors through Settings', async () => {
    db.listGrantsForAccount.mockRejectedValue(new Error('password authentication failed for secret-host'));
    const req = request('GET', '/api/mcp/grants');
    req.headers.cookie = sessionCookie({ email: 'friend@example.test' });
    const res = response();

    await grants(req, res);

    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body)).toEqual({
      error: 'server_error',
      message: 'Codex connections are temporarily unavailable.',
    });
    expect(res.body).not.toContain('secret-host');
  });

  it('updates an active grant time zone for the current account', async () => {
    db.updateGrantTimeZone.mockResolvedValue({
      id: 'grant', created_at: new Date('2026-01-01T00:00:00Z'), last_used_at: null,
      expires_at: new Date('2027-01-01T00:00:00Z'), time_zone: 'Europe/Paris',
    });
    const req = request('PATCH', '/api/mcp/grants', { grantId: 'grant', timeZone: 'Europe/Paris' });
    req.headers.cookie = sessionCookie({ email: 'friend@example.test' });
    const res = response();

    await grants(req, res);

    expect(res.statusCode).toBe(200);
    expect(db.updateGrantTimeZone).toHaveBeenCalledWith('grant', 'account', 'Europe/Paris');
  });
});

function sessionCookie({ email }) {
  const res = response();
  setSessionCookie(res, {
    refreshToken: 'google-refresh', accountId: 'account', email, name: null, createdAt: Date.now(),
  }, cookieSecret);
  return [res.getHeader('Set-Cookie')].flat()[0].split(';')[0];
}

function request(method, url, body) {
  return {
    method,
    url,
    body,
    headers: {
      host: 'emberlist.test',
      origin: 'https://emberlist.test',
      'content-type': 'application/json',
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
    body: '',
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    getHeader(name) { return headers.get(name.toLowerCase()); },
    end(value = '') { this.body = value; },
  };
}
