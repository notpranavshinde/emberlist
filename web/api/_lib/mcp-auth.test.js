import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  claimMutationReplay: vi.fn(),
  completeMutationReplay: vi.fn(),
  releaseMutationReplay: vi.fn(),
  writeAuditEvent: vi.fn(),
  findAccessToken: vi.fn(),
  getGrantSecret: vi.fn(),
}));

vi.mock('./mcp-db.js', () => db);

import {
  MCP_SCOPE,
  claimMcpMutation,
  decryptMcpSecret,
  encryptMcpSecret,
  hashOpaqueToken,
  readBody,
  validateAuthorizationRequest,
  validateClientRegistration,
  validateTimeZone,
  verifyMcpAccessToken,
  verifyPkce,
} from './mcp-auth.js';

const originalEnvironment = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.EMBERLIST_APP_ORIGIN = 'https://emberlist.test';
  process.env.EMBERLIST_MCP_AUTH_SECRET = 'mcp-test-secret-with-at-least-32-characters';
});

afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe('MCP OAuth client and authorization validation', () => {
  it('accepts public HTTPS and loopback clients and rejects unsafe redirects', () => {
    expect(validateClientRegistration({
      client_name: 'Codex',
      redirect_uris: ['https://client.test/callback', 'http://127.0.0.1:3456/callback'],
      token_endpoint_auth_method: 'none',
    }).redirectUris).toEqual(['https://client.test/callback', 'http://127.0.0.1:3456/callback']);

    for (const redirectUri of ['http://client.test/callback', 'https://client.test/callback#fragment', 'https://user@client.test/callback']) {
      expect(() => validateClientRegistration({ redirect_uris: [redirectUri] })).toThrow(/redirect_uri/u);
    }
    expect(() => validateClientRegistration({
      redirect_uris: ['https://client.test/callback'],
      token_endpoint_auth_method: 'client_secret_basic',
    })).toThrow(/public clients/u);
  });

  it('requires exact redirect, resource, state, S256 PKCE, and the application scope', () => {
    const challenge = crypto.createHash('sha256').update('v'.repeat(43)).digest('base64url');
    const base = {
      client_id: 'client',
      redirect_uri: 'https://client.test/callback',
      response_type: 'code',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      resource: 'https://emberlist.test/api/mcp',
      scope: `${MCP_SCOPE} offline_access`,
      state: 'csrf-state',
    };
    const validate = (overrides = {}) => validateAuthorizationRequest(
      new URLSearchParams({ ...base, ...overrides }),
      { client: { redirect_uris: [base.redirect_uri] }, resource: base.resource },
    );

    expect(validate()).toMatchObject({ scope: MCP_SCOPE, offlineAccess: true, state: 'csrf-state' });
    expect(() => validate({ state: '' })).toThrow(/state/u);
    expect(() => validate({ redirect_uri: 'https://evil.test/callback' })).toThrow(/registered/u);
    expect(() => validate({ resource: 'https://emberlist.test/api/mcp/' })).toThrow(/exactly/u);
    expect(() => validate({ code_challenge_method: 'plain' })).toThrow(/S256/u);
    expect(() => validate({ scope: `${MCP_SCOPE} admin` })).toThrow(/Supported scopes/u);
  });

  it('verifies S256 without accepting malformed verifiers', () => {
    const verifier = 'a'.repeat(43);
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    expect(verifyPkce(verifier, challenge)).toBe(true);
    expect(verifyPkce('short', challenge)).toBe(false);
    expect(verifyPkce('b'.repeat(43), challenge)).toBe(false);
  });
});

describe('MCP OAuth secrets and inputs', () => {
  it('encrypts Google refresh tokens and detects tampering', () => {
    const secret = process.env.EMBERLIST_MCP_AUTH_SECRET;
    const encrypted = encryptMcpSecret('google-refresh-token', secret);
    expect(encrypted).not.toContain('google-refresh-token');
    expect(decryptMcpSecret(encrypted, secret)).toBe('google-refresh-token');
    const [iv, tag, ciphertext] = encrypted.split('.');
    const tamperedBytes = Buffer.from(ciphertext, 'base64url');
    tamperedBytes[0] ^= 1;
    expect(() => decryptMcpSecret(`${iv}.${tag}.${tamperedBytes.toString('base64url')}`, secret)).toThrow();
  });

  it('rejects malformed JSON as an OAuth request error', () => {
    expect(() => readBody({ headers: { 'content-type': 'application/json' }, body: '{' }))
      .toThrow(/valid JSON/u);
  });

  it('validates IANA time zones', () => {
    expect(validateTimeZone('America/Phoenix')).toBe('America/Phoenix');
    expect(() => validateTimeZone('Mars/Olympus')).toThrow(/IANA/u);
  });

  it('rejects expired access tokens and expired grants while preserving the exact audience', async () => {
    db.findAccessToken.mockResolvedValue({
      client_id: 'client', scope: MCP_SCOPE, resource: 'https://emberlist.test/api/mcp',
      expires_at: new Date(Date.now() + 60_000), grant_id: 'grant', account_id: 'account',
      time_zone: 'UTC', revoked_at: null, grant_expires_at: new Date(Date.now() + 60_000),
    });
    await expect(verifyMcpAccessToken('access')).resolves.toMatchObject({
      resource: 'https://emberlist.test/api/mcp', scopes: [MCP_SCOPE],
    });

    db.findAccessToken.mockResolvedValueOnce({
      client_id: 'client', scope: MCP_SCOPE, resource: 'https://emberlist.test/api/mcp',
      expires_at: new Date(Date.now() - 1), grant_id: 'grant', account_id: 'account',
      time_zone: 'UTC', revoked_at: null, grant_expires_at: new Date(Date.now() + 60_000),
    });
    await expect(verifyMcpAccessToken('expired-access')).resolves.toBeNull();

    db.findAccessToken.mockResolvedValueOnce({
      client_id: 'client', scope: MCP_SCOPE, resource: 'https://emberlist.test/api/mcp',
      expires_at: new Date(Date.now() + 60_000), grant_id: 'grant', account_id: 'account',
      time_zone: 'UTC', revoked_at: null, grant_expires_at: new Date(Date.now() - 1),
    });
    await expect(verifyMcpAccessToken('expired-grant')).resolves.toBeNull();
  });
});

describe('mutation replay claims', () => {
  it('allows only one concurrent claim and reports the other as in progress', async () => {
    const requestHash = hashOpaqueToken('same request');
    db.claimMutationReplay
      .mockResolvedValueOnce({ claimed: true, request_hash: requestHash, status: 'pending' })
      .mockResolvedValueOnce({ claimed: false, request_hash: requestHash, status: 'pending' });

    const [first, second] = await Promise.all([
      claimMcpMutation('grant', 'mutation-123', requestHash),
      claimMcpMutation('grant', 'mutation-123', requestHash),
    ]);

    expect(first).toEqual({ status: 'claimed' });
    expect(second).toEqual({ status: 'in_progress' });
    expect(db.claimMutationReplay.mock.calls[0][1]).toBe(hashOpaqueToken('mutation-123'));
  });

  it('rejects reuse with different request arguments', async () => {
    db.claimMutationReplay.mockResolvedValue({
      claimed: false,
      request_hash: hashOpaqueToken('first'),
      status: 'completed',
      result_identifiers: { ok: true },
    });
    await expect(claimMcpMutation('grant', 'mutation-123', hashOpaqueToken('second')))
      .rejects.toMatchObject({ statusCode: 409 });
  });
});
