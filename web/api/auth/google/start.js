import crypto from 'node:crypto';
import {
  buildGoogleAuthUrl,
  getConfig,
  getOrigin,
  handleApiError,
  redirect,
  safeReturnTo,
  setStateCookie,
} from '../../_lib/auth.js';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.statusCode = 405;
    res.end('Method Not Allowed');
    return;
  }

  try {
    const { cookieSecret } = getConfig();
    const origin = getOrigin(req);
    const url = new URL(req.url, origin);
    const returnTo = safeReturnTo(url.searchParams.get('returnTo') ?? '');
    const nonce = crypto.randomUUID();

    setStateCookie(res, { nonce, returnTo, createdAt: Date.now() }, cookieSecret);
    redirect(res, buildGoogleAuthUrl({ origin, state: nonce }));
  } catch (error) {
    handleApiError(res, error);
  }
}
