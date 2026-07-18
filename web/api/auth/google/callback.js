import {
  OAUTH_STATE_COOKIE,
  clearCookie,
  exchangeCodeForTokens,
  fetchGoogleProfile,
  getConfig,
  getOrigin,
  handleApiError,
  readOAuthState,
  redirect,
  safeReturnTo,
  setNoStore,
  setSessionCookie,
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
      name: 'oauth-callback',
      limit: 60,
      windowSeconds: 10 * 60,
    });
    const { cookieSecret } = getConfig();
    const origin = getOrigin(req);
    const url = new URL(req.url, origin);
    const state = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    const storedState = readOAuthState(req, cookieSecret);

    clearCookie(res, OAUTH_STATE_COOKIE);

    if (error) {
      redirect(res, `/#/settings?syncError=${encodeURIComponent(error)}`);
      return;
    }
    if (!storedState || storedState.nonce !== state || !code) {
      redirect(res, '/#/settings?syncError=state_mismatch');
      return;
    }

    const tokens = await exchangeCodeForTokens({ code, origin });
    const profile = await fetchGoogleProfile(tokens.access_token);
    setSessionCookie(
      res,
      {
        refreshToken: tokens.refresh_token,
        email: profile.email,
        name: profile.name,
        createdAt: Date.now(),
      },
      cookieSecret,
    );
    redirect(res, appendAuthSuccessMarker(safeReturnTo(storedState.returnTo, origin)));
  } catch (error) {
    handleApiError(res, error);
  }
}

function appendAuthSuccessMarker(returnTo) {
  const [pathAndSearch, hash = ''] = returnTo.split('#');
  if (!hash) {
    const separator = pathAndSearch.includes('?') ? '&' : '?';
    return `${pathAndSearch}${separator}googleAuth=connected`;
  }

  const separator = hash.includes('?') ? '&' : '?';
  return `${pathAndSearch}#${hash}${separator}googleAuth=connected`;
}
