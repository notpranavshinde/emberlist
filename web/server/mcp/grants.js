import {
  assertSameOrigin,
  json,
  methodNotAllowed,
  requireSession,
  setNoStore,
} from '../../api/_lib/auth.js';
import {
  listGrantsForAccount,
  revokeGrant,
  updateGrantTimeZone,
  writeAuditEvent,
} from '../../api/_lib/mcp-db.js';
import { readBody, toMillis, validateTimeZone } from '../../api/_lib/mcp-auth.js';
import { enforceRateLimit } from '../../api/_lib/rate-limit.js';

export default async function handler(req, res) {
  setNoStore(res);
  if (!['GET', 'PATCH', 'DELETE'].includes(req.method)) return methodNotAllowed(res, ['GET', 'PATCH', 'DELETE']);
  try {
    await enforceRateLimit(req, res, { name: 'mcp-grants', limit: 120, windowSeconds: 60, includeSession: true });
    const session = requireSession(req);
    if (req.method === 'GET') {
      const rows = await listGrantsForAccount(session.accountId);
      return json(res, 200, { grants: rows.map(formatGrant) });
    }
    assertSameOrigin(req);
    const body = readBody(req);
    const grantId = typeof body.grantId === 'string' ? body.grantId : '';
    if (!grantId) return json(res, 400, { error: 'request_failed', message: 'grantId is required.' });
    if (req.method === 'DELETE') {
      const grant = await revokeGrant(grantId, session.accountId);
      if (!grant) return json(res, 404, { error: 'not_found' });
      try { await writeAuditEvent('mcp_grant_revoked', { clientId: grant.client_id, grantId: grant.id }); } catch { /* Best effort. */ }
      return json(res, 200, { revoked: true });
    }
    const row = await updateGrantTimeZone(grantId, session.accountId, validateTimeZone(body.timeZone));
    if (!row) return json(res, 404, { error: 'not_found' });
    return json(res, 200, { grant: formatGrant(row) });
  } catch (error) {
    const statusCode = typeof error?.statusCode === 'number' ? error.statusCode : 500;
    return json(res, statusCode, {
      error: statusCode >= 500 ? 'server_error' : 'request_failed',
      message: statusCode >= 500
        ? 'Codex connections are temporarily unavailable.'
        : error instanceof Error ? error.message : 'Request failed.',
    });
  }
}

function formatGrant(row) {
  return {
    id: row.id,
    ...(row.client_name ? { clientName: row.client_name } : {}),
    createdAt: toMillis(row.created_at),
    lastUsedAt: row.last_used_at ? toMillis(row.last_used_at) : null,
    expiresAt: toMillis(row.expires_at),
    timeZone: row.time_zone,
  };
}
