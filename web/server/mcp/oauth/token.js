import { methodNotAllowed, setNoStore } from '../../../api/_lib/auth.js';
import {
  consumeAuthorizationCodeAndIssue,
  getAuthorizationCode,
  getOAuthClient,
  getRefreshToken,
  revokeGrant,
  rotateRefreshToken,
  writeAuditEvent,
} from '../../../api/_lib/mcp-db.js';
import {
  MCP_SCOPE,
  assertMcpEnabled,
  createTokenPair,
  getMcpConfig,
  handleMcpOAuthError,
  hashOpaqueToken,
  oauthError,
  readBody,
  toMillis,
  verifyPkce,
  validateClientId,
} from '../../../api/_lib/mcp-auth.js';
import { enforceRateLimit } from '../../../api/_lib/rate-limit.js';

export default async function handler(req, res) {
  setNoStore(res);
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  try {
    assertMcpEnabled();
    await enforceRateLimit(req, res, { name: 'mcp-token', limit: 120, windowSeconds: 10 * 60 });
    const body = readBody(req);
    if (req.headers.authorization || body.client_secret) {
      throw oauthError('invalid_client', 'Client authentication is not supported for public clients.', 401);
    }
    const { resource } = getMcpConfig(req);
    const client = await getOAuthClient(validateClientId(body.client_id));
    if (!client) throw oauthError('invalid_client', 'Unknown or disabled public client.', 401);
    const tokens = body.grant_type === 'authorization_code'
      ? await exchangeCode(body, client, resource)
      : body.grant_type === 'refresh_token'
        ? await exchangeRefresh(body, client, resource)
        : (() => { throw oauthError('unsupported_grant_type', 'Unsupported grant_type.'); })();
    return tokenResponse(res, tokens);
  } catch (error) {
    await handleMcpOAuthError(res, error);
  }
}

async function exchangeCode(body, client, resource) {
  const rawCode = String(body.code || '');
  const codeHash = hashOpaqueToken(rawCode);
  const code = await getAuthorizationCode(codeHash);
  if (!code || code.consumed_at || toMillis(code.expires_at) <= Date.now()
    || code.revoked_at || toMillis(code.grant_expires_at) <= Date.now()) throw invalidGrant();
  if (code.client_id !== client.client_id
    || code.redirect_uri !== body.redirect_uri
    || code.resource !== resource
    || body.resource !== resource
    || !verifyPkce(String(body.code_verifier || ''), code.code_challenge)) throw invalidGrant();
  const pair = createTokenPair({
    grantId: code.grant_id,
    clientId: code.client_id,
    scope: MCP_SCOPE,
    resource,
  });
  const consumed = await consumeAuthorizationCodeAndIssue(
    codeHash,
    pair.accessRecord,
    code.offline_access ? pair.refreshRecord : null,
  );
  if (!consumed) throw invalidGrant();
  await audit('mcp_grant_issued', { clientId: code.client_id, grantId: code.grant_id });
  return { ...pair, includeRefresh: code.offline_access === true };
}

async function exchangeRefresh(body, client, resource) {
  const raw = String(body.refresh_token || '');
  const tokenHash = hashOpaqueToken(raw);
  const token = await getRefreshToken(tokenHash);
  if (!token || token.client_id !== client.client_id || token.resource !== resource || body.resource !== resource) {
    throw invalidGrant();
  }
  if (token.consumed_at) {
    await revokeGrant(token.grant_id);
    await audit('mcp_refresh_token_reuse', { clientId: token.client_id, grantId: token.grant_id });
    throw invalidGrant();
  }
  if (toMillis(token.expires_at) <= Date.now() || token.revoked_at || toMillis(token.grant_expires_at) <= Date.now()) {
    throw invalidGrant();
  }
  const pair = createTokenPair({
    grantId: token.grant_id,
    clientId: token.client_id,
    scope: MCP_SCOPE,
    resource,
    familyId: token.family_id,
  });
  const rotated = await rotateRefreshToken(tokenHash, pair.accessRecord, pair.refreshRecord);
  if (!rotated) {
    await revokeGrant(token.grant_id);
    await audit('mcp_refresh_token_reuse', { clientId: token.client_id, grantId: token.grant_id });
    throw invalidGrant();
  }
  return { ...pair, includeRefresh: true };
}

function tokenResponse(res, pair) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({
    access_token: pair.accessToken,
    token_type: 'Bearer',
    expires_in: pair.expiresIn,
    scope: MCP_SCOPE,
    ...(pair.includeRefresh ? { refresh_token: pair.refreshToken } : {}),
  }));
}

function invalidGrant() {
  return oauthError('invalid_grant', 'The authorization grant is invalid, expired, or already used.');
}

async function audit(eventName, details) {
  try { await writeAuditEvent(eventName, details); } catch { /* Audit failure must not change an OAuth result. */ }
}
