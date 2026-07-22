import { buildAdminGoogleAuthUrl, newAdminNonce, setAdminState } from '../../../_lib/admin-auth.js';
import { redirect, setNoStore } from '../../../_lib/auth.js';
import { enforceRateLimit } from '../../../_lib/rate-limit.js';

export default async function handler(req, res) {
  setNoStore(res);
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).end(); }
  try {
    await enforceRateLimit(req, res, { name: 'admin-oauth-start', limit: 20, windowSeconds: 600 });
    const nonce = newAdminNonce(); setAdminState(res, nonce); redirect(res, buildAdminGoogleAuthUrl(req, nonce));
  } catch (error) { res.status(error.statusCode || 500).json({ error: error.message }); }
}
