import {
  assertSameOrigin,
  clearAuthCookies,
  getConfig,
  handleApiError,
  json,
  methodNotAllowed,
  readSession,
  revokeGoogleToken,
} from '../../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    methodNotAllowed(res, ['POST']);
    return;
  }

  try {
    assertSameOrigin(req);
    const { cookieSecret } = getConfig();
    const session = readSession(req, cookieSecret);
    clearAuthCookies(res);
    if (session?.refreshToken) {
      await revokeGoogleToken(session.refreshToken);
    }
    json(res, 200, { ok: true });
  } catch (error) {
    handleApiError(res, error);
  }
}
