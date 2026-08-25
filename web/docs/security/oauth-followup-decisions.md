# OAuth Follow-Up Decisions

## Web Google Drive Auth Audit

Current default: backend-backed OAuth authorization-code flow through Vercel functions.

Findings:

- Production web sync no longer uses the implicit/token redirect flow by default.
- Google access and refresh tokens are not exposed to browser JavaScript in the default flow.
- The browser receives an HttpOnly encrypted session cookie and uses same-origin BFF endpoints for Drive appData operations.
- The legacy Google Identity Services token flow has been removed.

Residual risks:

- Normal web refresh tokens are encrypted in browser-held HttpOnly cookies rather than stored in a server database. This is acceptable for friend testing, but a persistent shared account store would give better revocation, audit, and token-rotation options.
- A compromised Vercel function environment can decrypt refresh-token cookies because it holds `EMBERLIST_AUTH_SECRET`.
- Session invalidation is coarse: rotating `EMBERLIST_AUTH_SECRET` signs everyone out.

Decision:

- Ship friend testing with the BFF cookie flow.
- Keep normal web sessions in the encrypted-cookie BFF. MCP grants use the
  database-backed design in `adr-mcp-oauth.md`, including encrypted Google
  credentials, hashed Emberlist tokens, rotation, reuse detection, and explicit
  connected-client revocation.

## Android Google Drive Auth Audit

Current Android sync uses Google Play services `AuthorizationClient` with `DriveScopes.DRIVE_APPDATA`, then constructs a Drive client with the returned short-lived access token.

Findings:

- Scope is appropriately narrow: only Drive appData.
- Android does not handle Google refresh tokens directly in app code.
- Sync behavior matches the web contract: one hidden `emberlist_sync.json` file in appData, newest duplicate file wins, malformed remote data fails safely.
- The local Room workspace is bound to the stable Google account identifier returned by authorization.

Decision:

- Ship the modern authorization flow with mandatory Drive onboarding.
- Preserve `drive.appdata` as the only Drive data scope.

## Cross-Account Protection

Decision:

- Defer Cross-Account Protection for friend testing.

Reasoning:

- Emberlist does not yet run a durable account/session database shared by normal web authentication; the isolated MCP grant database does not fill that role.
- CAP/RISC requires a receiver endpoint, signed event-token validation, event de-duplication, and security-event retention rules.
- With the current encrypted-cookie BFF, the useful response to RISC token-revocation events is limited.

Revisit when:

- Emberlist adds a durable account/session table shared by ordinary web and MCP
  sessions. The MCP grant database alone does not provide global web-session
  invalidation for CAP events.

## Incremental Authorization

Decision:

- Stay single-consent for now.

Reasoning:

- Google Drive sync is a core required feature, and it requires one non-basic scope: `https://www.googleapis.com/auth/drive.appdata`.
- Request that scope during mandatory workspace onboarding with clear contextual consent.
- There are no optional Google features that would benefit from staged scopes yet.

Revisit when:

- Emberlist adds optional Google Calendar, Gmail, Contacts, or full Drive-file features.
- The app needs multiple non-basic scopes that are not required for the same user action.

## References
- Google OAuth 2.0 for Web Server Applications: https://developers.google.com/identity/protocols/oauth2/web-server
- Google OAuth 2.0 best practices: https://developers.google.com/identity/protocols/oauth2/resources/best-practices
- Google Cross-Account Protection / RISC: https://developers.google.com/identity/protocols/risc
