import {
  getConfig,
  handleApiError,
  json,
  methodNotAllowed,
  readSession,
} from '../_lib/auth.js';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    methodNotAllowed(res, ['GET']);
    return;
  }

  try {
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
