import {
  clearCookie,
  getOrigin,
  methodNotAllowed,
  readEncryptedCookie,
  redirect,
  setNoStore,
} from '../../../../api/_lib/auth.js';
import { getAuthorizationRequest } from '../../../../api/_lib/mcp-db.js';
import {
  AUTHORIZATION_REQUEST_SECONDS,
  MCP_GOOGLE_STATE_COOKIE,
  assertMcpEnabled,
  establishMcpGoogleSession,
  getMcpConfig,
  handleMcpOAuthError,
  redirectWithOAuthResult,
  toMillis,
} from '../../../../api/_lib/mcp-auth.js';
import { enforceRateLimit } from '../../../../api/_lib/rate-limit.js';

export default async function handler(req, res) {
  setNoStore(res);
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  try {
    assertMcpEnabled();
    await enforceRateLimit(req, res, { name: 'mcp-google-callback', limit: 60, windowSeconds: 10 * 60 });
    const { authSecret } = getMcpConfig(req);
    const state = readEncryptedCookie(req, MCP_GOOGLE_STATE_COOKIE, authSecret);
    clearCookie(res, MCP_GOOGLE_STATE_COOKIE);
    const url = new URL(req.url, getOrigin(req));
    if (!validState(state, url.searchParams.get('state'))) throw callbackError('OAuth state is invalid or expired.');
    const request = await getAuthorizationRequest(state.requestId);
    if (!request || toMillis(request.expires_at) <= Date.now()) throw callbackError('Authorization request expired.');
    if (url.searchParams.get('error')) {
      return redirectWithOAuthResult(res, request, { error: 'access_denied' });
    }
    const code = url.searchParams.get('code');
    if (!code) throw callbackError('Google authorization code is missing.');
    await establishMcpGoogleSession({ code, req, res });
    return redirect(res, `/api/mcp/oauth/authorize?request_id=${encodeURIComponent(request.id)}`);
  } catch (error) {
    await handleMcpOAuthError(res, error);
  }
}

function validState(value, received) {
  return value
    && typeof value.nonce === 'string'
    && value.nonce === received
    && typeof value.requestId === 'string'
    && Number.isFinite(value.createdAt)
    && value.createdAt <= Date.now()
    && Date.now() - value.createdAt <= AUTHORIZATION_REQUEST_SECONDS * 1000;
}

function callbackError(message) {
  const error = new Error(message);
  error.oauthError = 'invalid_request';
  error.statusCode = 400;
  return error;
}
