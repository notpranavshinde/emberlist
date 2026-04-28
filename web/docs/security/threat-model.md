# Emberlist Web Threat Model

## Scope
- Single-page app in `web/src/App.tsx`.
- Google OAuth + Drive `appDataFolder` sync in `web/src/lib/syncService.ts`.
- Browser persistence in IndexedDB (`web/src/lib/db.ts`) and localStorage (`web/src/App.tsx`).

## Trust boundaries
1. User browser runtime and storage.
2. Vercel serverless auth and Drive sync endpoints.
3. Google Drive and OAuth APIs over HTTPS.
4. Deployment/CDN edge serving static assets.

## Primary assets
- Task/workspace data (projects, tasks, reminders, locations).
- Google refresh token encrypted in the server-auth cookie.
- Short-lived Google access token used inside serverless API calls.
- Cloud session profile hints (email/name in localStorage).

## Top threats (STRIDE)
- **Spoofing**: account confusion if stale login hint or multi-account browser context.
- **Tampering**: malicious/corrupt sync payloads in Drive.
- **Repudiation**: insufficient audit trail for auth/sync failures.
- **Information disclosure**: XSS or malicious browser extension exfiltrating local data; Vercel environment compromise exposing auth-cookie keys.
- **Denial of service**: repeated malformed payloads blocking sync.
- **Elevation of privilege**: dependency compromise or script injection gaining token/data access.

## Current controls
- Strict payload validation via `ensureSyncPayload` and schema gating via `assertSupportedSyncPayload`.
- Browser JavaScript does not receive Google access or refresh tokens in the default production flow.
- Refresh token cookie is encrypted, `Secure`, `HttpOnly`, and `SameSite=Lax`.
- Sync file scope limited to `drive.appdata`.

## Required mitigations before broad launch
1. Enforce CSP + security headers in production.
2. Dependency scanning + SBOM in CI.
3. Security-focused test matrix and release gate.
4. Security telemetry and incident runbooks.
5. Data retention and local storage lifecycle policy.
