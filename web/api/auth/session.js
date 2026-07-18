import {
  getConfig,
  handleApiError,
  json,
  methodNotAllowed,
  readSession,
  setNoStore,
} from '../_lib/auth.js';
import { enforceRateLimit } from '../_lib/rate-limit.js';

export default async function handler(req, res) {
  setNoStore(res);
  if (req.method !== 'GET') {
    methodNotAllowed(res, ['GET']);
    return;
  }

  try {
    await enforceRateLimit(req, res, {
      name: 'auth-session',
      limit: 120,
      windowSeconds: 60,
      includeSession: true,
    });
    const { cookieSecret } = getConfig();
    const session = readSession(req, cookieSecret);
    json(res, 200, {
      authenticated: Boolean(session),
      session: session
        ? {
            email: session.email,
            name: session.name,
          }
        : null,
    });
  } catch (error) {
    handleApiError(res, error);
  }
}
