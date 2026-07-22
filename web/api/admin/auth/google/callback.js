import { clearAdminSession, clearAdminState, exchangeAdminCode, getAdminConfig, readAdminState, setAdminSession } from '../../../_lib/admin-auth.js';
import { redirect, setNoStore } from '../../../_lib/auth.js';
import { enforceRateLimit } from '../../../_lib/rate-limit.js';

export default async function handler(req, res) {
  setNoStore(res);
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).end(); }
  try {
    await enforceRateLimit(req, res, { name: 'admin-oauth-callback', limit: 40, windowSeconds: 600 });
    const url = new URL(req.url, 'https://emberlist.dev');
    const stored = readAdminState(req); clearAdminState(res);
    if (url.searchParams.get('error')) return redirect(res, '/#/stats?adminError=cancelled');
    if (!stored || stored.nonce !== url.searchParams.get('state') || !url.searchParams.get('code')) return redirect(res, '/#/stats?adminError=state_mismatch');
    const profile = await exchangeAdminCode(req, url.searchParams.get('code'));
    const email = profile.email?.trim().toLowerCase();
    if (!email || profile.emailVerified !== true || !getAdminConfig().emails.has(email)) { clearAdminSession(res); return redirect(res, '/#/stats?adminError=access_denied'); }
    setAdminSession(res, email); return redirect(res, '/#/stats');
  } catch { clearAdminSession(res); return redirect(res, '/#/stats?adminError=auth_failed'); }
}
