# Security Launch Checklist (Web)

## Verified on August 21, 2026

- [x] Threat model and OAuth ADR updated for the implemented MCP architecture.
- [x] Security headers and CSP enforced on the production privacy and terms routes.
- [x] Local dependency audit passed with no vulnerabilities; lint passed with zero errors; 42 test files and 298 tests passed; security checks and production build passed.
- [x] Final production deployment `dpl_GHipUDnEn1uPFjYt2h4f2tL7GSeK` reached Ready and was aliased to `https://emberlist.dev`.
- [x] Live authorization-server metadata advertises `authorization_response_iss_parameter_supported: true`; the unauthenticated MCP endpoint remains `401` with the protected-resource URL in `WWW-Authenticate`.
- [x] The signed-in Google Cloud console shows exactly `https://emberlist.dev/api/mcp/oauth/google/callback` under the Emberlist Web client's authorized redirect URIs.
- [x] A connected personal plugin passed a content-free smoke: default `list_tasks` returned 20 open tasks, a no-op semantic write returned a committed revision with `replayed: false`, and an identical replay returned `replayed: true` without a duplicate or workspace-content change.
- [x] `npm run test:mcp:postgres` passed against disposable Neon branch `br-bitter-block-av6vn7j9`, exercising the migration, encrypted refresh-token storage/decryption, atomic one-time code consumption, refresh rotation race and reuse retention, cleanup retention, and grant cascade deletion.
- [x] The signed-in Neon console shows production main branch `br-billowing-shape-av2ohfej` with `schema_migrations`, all eight MCP tables, and production rows, proving the additive production migration is applied.
- [x] Vercel environment listing shows `DATABASE_URL`, `EMBERLIST_MCP_AUTH_SECRET`, `CRON_SECRET`, and `EMBERLIST_MCP_ENABLED` configured for Production, with no `VITE_` prefix. Values and secret entropy were not inspected.
- [x] Connected-client Settings and OAuth consent were visually verified at 1440×900 and 390×844. The narrow mobile FAB overlap was fixed and reverified, and grant expiry displays its 2027 date.
- [x] On August 24, the connected personal plugin passed the disposable production mutation sequence: create, edit, complete, reopen, raw export, no-op merge, guarded unchanged replacement, and delete. The disposable task disappeared from active results and remained only as a sync tombstone.

## Outstanding gates

- [ ] CI/release SBOM generated and policy thresholds satisfied for the release candidate.
- [ ] Complete security test matrix passed, including the production-integration items below.
- [ ] Incident response and on-call playbooks validated.
- [ ] Data retention/storage policy documented and implemented.
- [ ] Disabled health behavior, distributed rate limits, and daily authenticated cleanup are verified in production.
- [ ] The complete Google-to-MCP callback state flow is exercised end to end; redirect-URI registration alone does not close this gate.
- [x] Automated OAuth discovery, registration, PKCE, consent, rotation/reuse detection, expiry, audience, revocation, and encryption tests pass.
- [x] Automated raw-replacement validation, stale-revision, atomic precondition, and semantic/merge retry tests pass.
- [ ] Product analytics and logs are verified free of MCP workspace data, raw arguments, titles, and bearer tokens.
- [ ] Mandatory Google onboarding, account mismatch, offline-returning-user, and sign-out clearing flows manually exercised.
- [ ] Complete the remaining production-integration checks: revoke a disposable grant and confirm synchronization in both web and Android without disconnecting the installed personal plugin grant. The production mutation sequence is verified above.
- [x] The personal Codex plugin validates from the personal marketplace and exposes both skills and every expected MCP tool.
- [ ] Rollback criteria and release owner sign-off recorded.
- [ ] Rollback is rehearsed: disable `EMBERLIST_MCP_ENABLED`, send an authenticated `DELETE` to `/api/internal/mcp-cleanup` to revoke all grants, restore the prior Vercel deployment, and retain additive tables without destructive down migrations.
