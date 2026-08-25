# Emberlist Web Threat Model

## Scope

- Single-page app in `web/src/App.tsx`.
- Google OAuth + Drive `appDataFolder` sync in `web/src/lib/syncService.ts`.
- Remote MCP workspace tools and OAuth handlers under `web/server/mcp/**`, multiplexed through the public `web/api/drive/sync-file.js` serverless entry point.
- Provider-neutral OAuth and security metadata in Postgres.
- Browser persistence in IndexedDB (`web/src/lib/db.ts`) and centralized localStorage access (`web/src/lib/webStorage.ts`).

## Trust boundaries

1. User browser runtime and storage.
2. Vercel serverless auth and Drive sync endpoints.
3. Google Drive and OAuth APIs over HTTPS.
4. Deployment/CDN edge serving static assets.
5. Public Codex clients using Streamable HTTP and OAuth discovery.
6. Neon Postgres holding MCP authorization metadata but no workspace payloads.

## Primary assets

- Task/workspace data (projects, tasks, reminders, locations).
- Google refresh token encrypted in the server-auth cookie.
- Short-lived Google access token used inside serverless API calls.
- Cloud session profile hints and stable account binding (subject/email/name in localStorage and IndexedDB metadata).
- MCP grants, hashed access/refresh tokens, encrypted Google refresh tokens, mutation request hashes, and security audit records.
- Drive revision tokens used to prevent lost updates.

## Top threats (STRIDE)

- **Spoofing**: account confusion if stale login hint or multi-account browser context.
- **Tampering**: malicious/corrupt sync payloads in Drive.
- **Repudiation**: insufficient audit trail for auth/sync failures.
- **Information disclosure**: XSS or malicious browser extension exfiltrating local data; Vercel environment compromise exposing auth-cookie keys.
- **Denial of service**: repeated malformed payloads blocking sync.
- **Elevation of privilege**: dependency compromise or script injection gaining token/data access.
- **Spoofing**: redirect URI substitution, authorization-code interception, forged resource audiences, or stolen bearer tokens.
- **Tampering**: stale raw replacement overwriting a newer workspace or conflicting semantic mutations losing changes.
- **Repudiation**: destructive MCP calls without content-safe security records.
- **Information disclosure**: raw tool arguments, task titles, bearer tokens, or Google credentials reaching logs or Postgres.
- **Denial of service**: repeated registration, authorization, token, or oversized MCP requests exhausting serverless/database capacity.

## Current controls

- Strict payload validation via `ensureSyncPayload` and schema gating via `assertSupportedSyncPayload`.
- Browser JavaScript does not receive Google access or refresh tokens in the default production flow.
- Refresh token cookie is encrypted, `Secure`, `HttpOnly`, and `SameSite=Lax`.
- Sync file scope limited to `drive.appdata`.
- Workspace routes are blocked until a backend Google session is present.
- IndexedDB workspace data is bound to the stable Google subject identifier; a mismatched account is rejected before merge.
- Sign-out requires a final sync, then clears workspace storage without deleting the remote Drive file.
- Public MCP clients use exact registered redirects, mandatory S256 PKCE, exact resource matching, one-time five-minute codes, and RFC 9207 issuer binding; production metadata advertises issuer-response support.
- Access tokens expire after one hour; refresh tokens rotate, expire after 90 days, and trigger grant revocation on reuse; grants have a one-year absolute expiry.
- Google refresh tokens are encrypted with a dedicated MCP secret. Access/refresh tokens are hashed and task payloads, raw arguments, titles, and bearer tokens are excluded from storage and logs.
- Every write requires a mutation ID. Only request hashes and result identifiers are retained for 24-hour replay protection.
- Semantic writes bind the observed Drive version to a strong ETag `If-Match` update with bounded retries; raw merge reloads on conflict; exact replacement fails on a stale revision and validates the supplied payload without repair.
- Workspace payloads are limited to 2 MiB. Structured tools omit quick-add parsing and geocoding.
- Users can inspect and immediately revoke connected clients in Settings. Revocation deletes the MCP grant without revoking the Google token shared with web sync.
- Daily authenticated cleanup removes expired OAuth state and 30-day audit records.

## Residual gates before broad multi-user launch

1. Generate and review the release-candidate SBOM in CI.
2. Validate security telemetry alerting and the incident runbooks.
3. Verify production distributed rate limiting and authenticated daily cleanup.
4. Complete disposable-grant revocation and cross-client web/Android sync confirmation; the connected-plugin mutation sequence is verified.
5. Rehearse kill-switch, all-grants revocation, and prior-deployment restoration.
