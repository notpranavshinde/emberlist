import {
  assertSameOrigin,
  clearAuthCookies,
  getConfig,
  handleApiError,
  json,
  methodNotAllowed,
  readSession,
  revokeGoogleToken,
  setNoStore,
} from '../../_lib/auth.js';
import { enforceRateLimit } from '../../_lib/rate-limit.js';

export default async function handler(req, res) {
  setNoStore(res);
  if (req.method !== 'POST') {
    methodNotAllowed(res, ['POST']);
    return;
  }

  try {
    assertSameOrigin(req);
    await enforceRateLimit(req, res, {
      name: 'oauth-logout',
      limit: 20,
      windowSeconds: 10 * 60,
      includeSession: true,
    });
    const { cookieSecret } = getConfig();
    const session = readSession(req, cookieSecret);
    if (session?.refreshToken) {
      await revokeGoogleToken(session.refreshToken);
    }
    clearAuthCookies(res);
    json(res, 200, { ok: true });
  } catch (error) {
    handleApiError(res, error);
  }
}
