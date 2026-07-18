# ADR: Web Authentication Architecture

## Status
Accepted: use a backend-backed Google OAuth flow for production web sync.

## Context
The original web client used Google Identity Services directly in the browser and called Drive APIs with an in-memory access token. That kept the app backend-free, but it also meant reload-time sync depended on browser token restoration and could still surface popup/account-chooser behavior.

Google's web-server OAuth guidance is a better fit now that Emberlist is deployed on Vercel: a server endpoint can keep the client secret off the browser, exchange an authorization code for refresh/access tokens, and refresh Drive access without prompting the user on every reload.

## Decision
Use Vercel serverless functions as a small backend-for-frontend for Google Drive sync:

- `/api/auth/google/start` creates an OAuth `state`, stores it in an encrypted HttpOnly cookie, and redirects to Google with `response_type=code`, `access_type=offline`, and the Drive appData scope.
- `/api/auth/google/callback` validates `state`, exchanges the code server-side, stores the Google refresh token in an encrypted `Secure`, `HttpOnly`, `SameSite=Lax` cookie, and redirects back to the app.
- `/api/auth/session` exposes only the signed-in profile summary needed by the UI.
- `/api/drive/sync-file` refreshes Google access server-side and proxies download, upload, and reset operations for the hidden Drive appData sync file.
- The legacy browser-token implementation remains available only when `VITE_GOOGLE_AUTH_MODE=legacy_spa` is explicitly set.

## Security Controls
- Google client secret is read only from server environment variables.
- Refresh token is encrypted before being stored in a cookie.
- Browser JavaScript no longer receives Google access or refresh tokens in the default production flow.
- OAuth `state` is non-guessable, stored server-side in an encrypted HttpOnly cookie, and validated on callback.
- Session and OAuth-state creation times are validated server-side; expired, future-dated, and malformed cookies are rejected.
- OAuth return destinations are parsed against the canonical application origin and restricted to non-API paths on that origin.
- Mutating API methods require same-origin requests.
- Sensitive API and OAuth responses use `Cache-Control: no-store`.
- Sync uploads and downloads are capped at 2 MiB and validated for schema, types, string lengths, and entity counts.
- Auth and sync endpoints are rate-limited by IP and, where available, an opaque hash of the encrypted session cookie.
- Disconnect revokes the refresh token when possible and clears auth cookies.

## Required Deployment Configuration
- Google OAuth web client redirect URI: `https://emberlist.dev/api/auth/google/callback`.
- Vercel environment variables:
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `EMBERLIST_AUTH_SECRET` with at least 32 random bytes of entropy.
- Recommended:
  - `EMBERLIST_APP_ORIGIN=https://emberlist.dev` pins redirects and same-origin checks to the production origin.
  - `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` enable distributed rate limits across serverless instances.
- Optional fallback:
  - `VITE_GOOGLE_AUTH_MODE=legacy_spa` can temporarily restore the old browser-token path for local troubleshooting.

## Alternatives Considered
- **Keep SPA token model**: simplest, but popup/account-chooser restoration remains fragile and browser JS handles Google API tokens.
- **Full backend database token store**: stronger central revocation and auditability, but requires a real database and account model. The encrypted cookie BFF is the pragmatic intermediate step for friend testing.

## Consequences
- Friend testers should no longer need a popup on refresh/reopen once connected.
- Vercel is now part of the sync trust boundary.
- If `EMBERLIST_AUTH_SECRET` rotates, existing web sync sessions are invalidated and users must reconnect Google Drive.
- Without the optional Upstash settings, rate limits use a bounded in-memory fallback. This protects each warm serverless instance, but counters do not survive cold starts and are not shared across instances. Platform-level WAF/rate limiting remains recommended for broad launch.
- If the distributed rate-limit store is temporarily unavailable, the endpoint falls back to its warm-instance counter so sync availability is preserved.
- A future multi-user backend can replace the encrypted cookie store without changing the Drive merge contract.

## References
- Google OAuth 2.0 for Web Server Applications: https://developers.google.com/identity/protocols/oauth2/web-server
- Google OAuth 2.0 best practices: https://developers.google.com/identity/protocols/oauth2/resources/best-practices
