import crypto from 'node:crypto';
import {
  assertSameOrigin,
  clearCookie,
  getConfig,
  getOrigin,
  methodNotAllowed,
  readSession,
  redirect,
  setEncryptedCookie,
  setNoStore,
} from '../../../api/_lib/auth.js';
import {
  approveAuthorizationRequest,
  createAuthorizationRequest,
  denyAuthorizationRequest,
  getAuthorizationRequest,
  getOAuthClient,
} from '../../../api/_lib/mcp-db.js';
import {
  AUTHORIZATION_CODE_SECONDS,
  AUTHORIZATION_REQUEST_SECONDS,
  GRANT_SECONDS,
  MCP_GOOGLE_STATE_COOKIE,
  assertMcpEnabled,
  buildMcpGoogleAuthUrl,
  createOpaqueToken,
  encryptMcpSecret,
  getMcpConfig,
  handleMcpOAuthError,
  hashOpaqueToken,
  readBody,
  redirectWithOAuthResult,
  toMillis,
  validateAuthorizationRequest,
  validateClientId,
  validateTimeZone,
} from '../../../api/_lib/mcp-auth.js';
import { enforceRateLimit } from '../../../api/_lib/rate-limit.js';

export default async function handler(req, res) {
  setNoStore(res);
  if (!['GET', 'POST'].includes(req.method)) return methodNotAllowed(res, ['GET', 'POST']);
  try {
    assertMcpEnabled();
    await enforceRateLimit(req, res, { name: 'mcp-authorize', limit: 60, windowSeconds: 10 * 60, includeSession: true });
    if (req.method === 'POST') return authorize(req, res);
    return showConsent(req, res);
  } catch (error) {
    await handleMcpOAuthError(res, error);
  }
}

async function showConsent(req, res) {
  const { issuer, resource, authSecret } = getMcpConfig(req);
  const url = new URL(req.url, issuer);
  let request;
  const requestId = url.searchParams.get('request_id');
  if (requestId) {
    request = await getAuthorizationRequest(requestId);
  } else {
    const clientId = validateClientId(url.searchParams.get('client_id'));
    const client = await getOAuthClient(clientId);
    if (!client) throw oauthRequestError('Unknown or disabled client_id.');
    let values;
    try {
      values = validateAuthorizationRequest(url.searchParams, { client, resource });
    } catch (error) {
      const redirectUri = url.searchParams.get('redirect_uri');
      const state = url.searchParams.get('state');
      if (state && client.redirect_uris.includes(redirectUri)) {
        return redirectWithOAuthResult(res, { redirect_uri: redirectUri, state }, issuer, {
          error: error?.oauthError || 'invalid_request',
        });
      }
      throw error;
    }
    request = {
      id: crypto.randomUUID(),
      client_id: clientId,
      client_name: client.client_name,
      expires_at: new Date(Date.now() + AUTHORIZATION_REQUEST_SECONDS * 1000),
      ...toDatabaseAuthorization(values),
    };
    await createAuthorizationRequest({
      id: request.id,
      clientId,
      expiresAt: request.expires_at,
      ...values,
    });
  }
  assertPendingRequest(request);
  const { cookieSecret } = getConfig();
  const session = readSession(req, cookieSecret);
  if (!session) {
    const nonce = crypto.randomUUID();
    setEncryptedCookie(res, MCP_GOOGLE_STATE_COOKIE, {
      nonce,
      requestId: request.id,
      createdAt: Date.now(),
    }, authSecret, AUTHORIZATION_REQUEST_SECONDS);
    return redirect(res, buildMcpGoogleAuthUrl({ req, state: nonce }));
  }
  return renderConsent(res, request, session);
}

async function authorize(req, res) {
  assertSameOrigin(req);
  const body = readBody(req);
  const request = await getAuthorizationRequest(String(body.request_id || ''));
  const { issuer, authSecret } = getMcpConfig(req);
  try {
    assertPendingRequest(request);
    const { cookieSecret } = getConfig();
    const session = readSession(req, cookieSecret);
    if (!session) throw oauthRequestError('The Google session expired. Restart authorization.', 401);
    if (body.decision !== 'allow') {
      const denied = await denyAuthorizationRequest(request.id);
      if (!denied) throw oauthRequestError('Authorization request is no longer available.');
      return redirectWithOAuthResult(res, denied, issuer, { error: 'access_denied' });
    }
    const timeZone = validateTimeZone(body.time_zone);
    const rawCode = createOpaqueToken('el_code_');
    const approved = await approveAuthorizationRequest({
      requestId: request.id,
      grant: {
        id: crypto.randomUUID(),
        accountId: session.accountId,
        encryptedGoogleRefreshToken: encryptMcpSecret(session.refreshToken, authSecret),
        timeZone,
        expiresAt: new Date(Date.now() + GRANT_SECONDS * 1000),
      },
      code: {
        hash: hashOpaqueToken(rawCode),
        expiresAt: new Date(Date.now() + AUTHORIZATION_CODE_SECONDS * 1000),
      },
    });
    if (!approved) throw oauthRequestError('Authorization request is no longer available.');
    clearCookie(res, MCP_GOOGLE_STATE_COOKIE);
    return redirectWithOAuthResult(res, approved, issuer, { code: rawCode });
  } catch (error) {
    if (request?.redirect_uri && request?.state && (error?.statusCode ?? 500) < 500) {
      return redirectWithOAuthResult(res, request, issuer, { error: error?.oauthError || 'invalid_request' });
    }
    throw error;
  }
}

function renderConsent(res, request, session) {
  const nonce = crypto.randomBytes(18).toString('base64url');
  const redirectOrigin = new URL(request.redirect_uri).origin;
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; form-action 'self' ${redirectOrigin}; base-uri 'none'; frame-ancestors 'none'`);
  res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Connect ${escapeHtml(request.client_name)}</title><style>body{font:16px system-ui;max-width:36rem;margin:4rem auto;padding:0 1.25rem;color:#241b16}button,input{font:inherit;padding:.7rem}button[value=allow]{background:#FE8C2F;border:0;border-radius:.4rem}form{display:grid;gap:1rem}.actions{display:flex;gap:.75rem}</style><main><h1>Connect ${escapeHtml(request.client_name)} to Emberlist?</h1><p>Signed in as ${escapeHtml(session.email || session.name || 'your Google account')}.</p><p>This client can read, create, edit, move, complete, delete, and import workspace items. It can replace the full workspace only when you explicitly request that action. Emberlist does not store task content on its server.</p><form method="post" action="/api/mcp/oauth/authorize"><input type="hidden" name="request_id" value="${escapeHtml(request.id)}"><label>Time zone <input id="time-zone" name="time_zone" value="UTC" required></label><div class="actions"><button name="decision" value="allow">Allow</button><button name="decision" value="deny">Deny</button></div></form></main><script nonce="${nonce}">document.getElementById('time-zone').value=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'</script></html>`);
}

function assertPendingRequest(request) {
  if (!request || request.approved_at || request.denied_at || toMillis(request.expires_at) <= Date.now()) {
    throw oauthRequestError('Authorization request is invalid or expired.');
  }
}

function toDatabaseAuthorization(values) {
  return {
    redirect_uri: values.redirectUri,
    state: values.state,
    scope: values.scope,
    offline_access: values.offlineAccess,
    resource: values.resource,
    code_challenge: values.codeChallenge,
  };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function oauthRequestError(message, statusCode = 400) {
  const error = new Error(message);
  error.oauthError = 'invalid_request';
  error.statusCode = statusCode;
  return error;
}
