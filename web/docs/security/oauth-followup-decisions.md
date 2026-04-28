# OAuth Follow-Up Decisions

## Web Google Drive Auth Audit
Current default: backend-backed OAuth authorization-code flow through Vercel functions.

Findings:
- Production web sync no longer uses the implicit/token redirect flow by default.
- Google access and refresh tokens are not exposed to browser JavaScript in the default flow.
- The browser receives an HttpOnly encrypted session cookie and uses same-origin BFF endpoints for Drive appData operations.
- The legacy Google Identity Services token flow remains available only behind `VITE_GOOGLE_AUTH_MODE=legacy_spa` for troubleshooting.

Residual risks:
- Refresh tokens are encrypted client-side in cookies rather than stored in a server database. This is acceptable for friend testing, but a persistent backend store would give better revocation, audit, and token-rotation options.
- A compromised Vercel function environment can decrypt refresh-token cookies because it holds `EMBERLIST_AUTH_SECRET`.
- Session invalidation is coarse: rotating `EMBERLIST_AUTH_SECRET` signs everyone out.

Decision:
- Ship friend testing with the BFF cookie flow.
- Revisit database-backed token storage before broader public launch.

## Android Google Drive Auth Audit
Current Android sync uses `GoogleSignIn` with `DriveScopes.DRIVE_APPDATA`, then constructs a Drive client through `GoogleAccountCredential.usingOAuth2`.

Findings:
- Scope is appropriately narrow: only Drive appData.
- Android does not handle Google refresh tokens directly in app code.
- Sync behavior matches the web contract: one hidden `emberlist_sync.json` file in appData, newest duplicate file wins, malformed remote data fails safely.
- The Android implementation still depends on legacy `GoogleSignIn` APIs.

Decision:
- Do not block friend testing on Android auth migration.
- Keep Android's current implementation until after web friend testing.
- Later migration target: modern Google Identity Services / Credential Manager guidance for Android, preserving `drive.appdata` as the only Drive scope.

## Cross-Account Protection
Decision:
- Defer Cross-Account Protection for friend testing.

Reasoning:
- Emberlist does not yet run a durable account backend or token database.
- CAP/RISC requires a receiver endpoint, signed event-token validation, event de-duplication, and security-event retention rules.
- With the current encrypted-cookie BFF, the useful response to RISC token-revocation events is limited.

Revisit when:
- Emberlist stores refresh tokens server-side in a database.
- There is a durable account/session table that can map Google subject identifiers to active sessions.

## Incremental Authorization
Decision:
- Stay single-consent for now.

Reasoning:
- Google Drive sync is a core opt-in feature, and it requires one non-basic scope: `https://www.googleapis.com/auth/drive.appdata`.
- Requesting that scope only when the user chooses Google Drive already provides contextual consent.
- There are no optional Google features that would benefit from staged scopes yet.

Revisit when:
- Emberlist adds optional Google Calendar, Gmail, Contacts, or full Drive-file features.
- The app needs multiple non-basic scopes that are not required for the same user action.

## References
- Google OAuth 2.0 for Web Server Applications: https://developers.google.com/identity/protocols/oauth2/web-server
- Google OAuth 2.0 best practices: https://developers.google.com/identity/protocols/oauth2/resources/best-practices
- Google Cross-Account Protection / RISC: https://developers.google.com/identity/protocols/risc
