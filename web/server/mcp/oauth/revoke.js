import { methodNotAllowed, setNoStore } from '../../../api/_lib/auth.js';
import { revokeGrantForTokenHash, writeAuditEvent } from '../../../api/_lib/mcp-db.js';
import {
  handleMcpOAuthError,
  hashOpaqueToken,
  readBody,
} from '../../../api/_lib/mcp-auth.js';
import { enforceRateLimit } from '../../../api/_lib/rate-limit.js';

export default async function handler(req, res) {
  setNoStore(res);
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  try {
    await enforceRateLimit(req, res, { name: 'mcp-revoke', limit: 120, windowSeconds: 10 * 60 });
    const body = readBody(req);
    if (typeof body.token === 'string' && body.token) {
      const grant = await revokeGrantForTokenHash(hashOpaqueToken(body.token));
      if (grant) {
        try { await writeAuditEvent('mcp_grant_revoked', { clientId: grant.client_id, grantId: grant.id }); } catch { /* Best effort. */ }
      }
    }
    res.statusCode = 200;
    res.end();
  } catch (error) {
    await handleMcpOAuthError(res, error);
  }
}
