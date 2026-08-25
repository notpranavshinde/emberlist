# TODO

## Deployment

- [ ] Add `https://emberlist.dev/api/auth/google/callback` to the Google web OAuth client's authorized redirect URIs.
- [ ] Set Vercel environment variables for backend authentication: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `EMBERLIST_AUTH_SECRET`.
- [ ] Add `https://emberlist.dev/api/admin/auth/google/callback` to the Google web OAuth client's authorized redirect URIs.
- [ ] Set `ANALYTICS_ID_SECRET`, `EMBERLIST_ADMIN_AUTH_SECRET`, and `EMBERLIST_ANALYTICS_ADMIN_EMAILS=notpranavshinde@gmail.com` in Vercel before enabling schema-v2 clients.
- [x] Verify production Neon main branch `br-billowing-shape-av2ohfej` contains `schema_migrations`, all eight MCP tables, and production rows, proving the additive migrations are applied.
- [x] Verify Vercel Production config includes `DATABASE_URL`, `EMBERLIST_MCP_AUTH_SECRET`, `CRON_SECRET`, and `EMBERLIST_MCP_ENABLED`, with no `VITE_` exposure; variable values were not inspected.
- [x] Verify in the signed-in Google Cloud console that the Emberlist Web client registers exactly `https://emberlist.dev/api/mcp/oauth/google/callback` as an authorized redirect URI.
- [x] Deploy final MCP build `dpl_GHipUDnEn1uPFjYt2h4f2tL7GSeK`, verify it is Ready and aliased to `https://emberlist.dev`, confirm RFC 9207 issuer-support metadata is `true`, and confirm the unauthenticated MCP challenge remains `401` with the protected-resource URL.
- [x] Visually verify connected-client Settings and OAuth consent at 1440×900 and 390×844, fix and reverify the narrow mobile FAB overlap, and confirm grant expiry displays the 2027 date.
- [x] Verify the connected personal plugin with a content-free production smoke: default `list_tasks`, a no-op semantic write, and identical replay without a duplicate or workspace-content change.
- [x] Run the connected-plugin disposable production mutation smoke: create, edit, complete/reopen, raw export, no-op merge, guarded unchanged replacement, and delete; verify the task is absent from active results and retained only as a normal sync tombstone.
- [ ] Complete the remaining rollout smoke with immediate revocation of a disposable grant and web/Android synchronization confirmation; keep the installed personal plugin grant connected.
- [x] Run `npm run test:mcp:postgres` against disposable Neon branch `br-bitter-block-av6vn7j9`, covering migration, encrypted refresh-token storage/decryption, atomic code consumption, refresh rotation/reuse, retention, and cascade deletion.
- [ ] Rehearse rollback: disable MCP, revoke all grants through the authenticated cleanup route, and restore the prior Vercel deployment.

## Android Release

- [ ] Repair ambiguous Compose selectors and activity startup handling so `connectedAndroidTest` passes reliably on physical devices.
- [x] Migrate Android Drive authorization from legacy `GoogleSignIn` APIs to Google's `AuthorizationClient`.
- [ ] Update the Play Store Data Safety declaration for resettable anonymous product analytics before the next Android release.

## Security Follow-up

- [ ] Upgrade React Router when a release fixes `GHSA-qwww-vcr4-c8h2`; Emberlist uses client-only `HashRouter` and does not enable the affected RSC/Server Action mode.
