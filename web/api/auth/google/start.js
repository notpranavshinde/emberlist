import crypto from 'node:crypto';
import {
  buildGoogleAuthUrl,
  getConfig,
  getOrigin,
  handleApiError,
  redirect,
  safeReturnTo,
  setNoStore,
  setStateCookie,
} from '../../_lib/auth.js';
import { enforceRateLimit } from '../../_lib/rate-limit.js';

export default async function handler(req, res) {
  setNoStore(res);
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.statusCode = 405;
    res.end('Method Not Allowed');
    return;
  }

  try {
    await enforceRateLimit(req, res, {
      name: 'oauth-start',
      limit: 30,
      windowSeconds: 10 * 60,
    });
    const { cookieSecret } = getConfig();
    const origin = getOrigin(req);
    const url = new URL(req.url, origin);
    const returnTo = safeReturnTo(url.searchParams.get('returnTo') ?? '', origin);
    const nonce = crypto.randomUUID();

    setStateCookie(res, { nonce, returnTo, createdAt: Date.now() }, cookieSecret);
    redirect(res, buildGoogleAuthUrl({ origin, state: nonce }));
  } catch (error) {
    handleApiError(res, error);
  }
}
