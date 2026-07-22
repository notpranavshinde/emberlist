import { readAdminSession } from '../../_lib/admin-auth.js';
import { json, setNoStore } from '../../_lib/auth.js';

export default function handler(req, res) {
  setNoStore(res);
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return json(res, 405, { error: 'method_not_allowed' }); }
  try {
    const session = readAdminSession(req);
    return json(res, session ? 200 : 401, session ? { authenticated: true, email: session.email, expiresAt: session.createdAt + 12 * 60 * 60 * 1_000 } : { authenticated: false });
  } catch (error) { return json(res, error.statusCode || 503, { authenticated: false, error: 'unavailable' }); }
}
