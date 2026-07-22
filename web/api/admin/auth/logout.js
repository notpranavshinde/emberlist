import { assertAdminSameOrigin, clearAdminSession, clearAdminState } from '../../_lib/admin-auth.js';
import { json, setNoStore } from '../../_lib/auth.js';

export default function handler(req, res) {
  setNoStore(res);
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return json(res, 405, { error: 'method_not_allowed' }); }
  try { assertAdminSameOrigin(req); clearAdminSession(res); clearAdminState(res); return json(res, 200, { ok: true }); }
  catch (error) { return json(res, error.statusCode || 400, { error: 'request_failed' }); }
}
