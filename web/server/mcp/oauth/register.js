import crypto from 'node:crypto';
import { methodNotAllowed, setNoStore } from '../../../api/_lib/auth.js';
import { registerOAuthClient } from '../../../api/_lib/mcp-db.js';
import {
  assertMcpEnabled,
  handleMcpOAuthError,
  readBody,
  validateClientRegistration,
} from '../../../api/_lib/mcp-auth.js';
import { enforceRateLimit } from '../../../api/_lib/rate-limit.js';

export default async function handler(req, res) {
  setNoStore(res);
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  try {
    assertMcpEnabled();
    await enforceRateLimit(req, res, { name: 'mcp-dcr', limit: 30, windowSeconds: 10 * 60 });
    const registration = validateClientRegistration(readBody(req));
    const clientId = `el_client_${crypto.randomBytes(24).toString('base64url')}`;
    const row = await registerOAuthClient({ clientId, ...registration });
    res.statusCode = 201;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      client_id: row.client_id,
      client_id_issued_at: Math.floor(new Date(row.created_at).getTime() / 1000),
      client_name: row.client_name,
      redirect_uris: row.redirect_uris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: 'emberlist.workspace offline_access',
    }));
  } catch (error) {
    await handleMcpOAuthError(res, error);
  }
}
