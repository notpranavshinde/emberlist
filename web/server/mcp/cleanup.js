import crypto from 'node:crypto';
import { json, methodNotAllowed, setNoStore } from '../../api/_lib/auth.js';
import { cleanupMcpDatabase, revokeAllMcpGrants } from '../../api/_lib/mcp-db.js';

export default async function handler(req, res) {
  setNoStore(res);
  if (!['GET', 'DELETE'].includes(req.method)) return methodNotAllowed(res, ['GET', 'DELETE']);
  const expected = process.env.CRON_SECRET || '';
  const provided = typeof req.headers.authorization === 'string'
    ? req.headers.authorization.replace(/^Bearer\s+/iu, '')
    : '';
  if (!expected || !safeEqual(expected, provided)) return json(res, 401, { error: 'unauthorized' });
  try {
    if (req.method === 'DELETE') return json(res, 200, { revokedGrants: await revokeAllMcpGrants() });
    return json(res, 200, { cleaned: await cleanupMcpDatabase() });
  } catch {
    return json(res, 500, { error: 'server_error' });
  }
}

function safeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
