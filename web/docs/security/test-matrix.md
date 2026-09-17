# Security Test Matrix

## Mandatory tests

1. **Payload validation abuse tests**
   - malformed schema
   - prototype-pollution style objects
   - unexpected enum values and types
2. **OAuth/sync resilience**
   - encoded and literal backslash return destinations stay on the application origin
   - missing, expired, and future-dated session/state cookies are rejected
   - upload body size, entity count, and field-length bounds are enforced
   - rate-limit responses return `429` and `Retry-After`
   - backend refresh-token failures
   - authorization callback state mismatch
   - insufficient permissions handling
   - network and timeout behavior
   - session identity includes a stable Google subject identifier
   - account-bound caches reject a different Google subject before merge
3. **Storage safety**
   - sign-out uploads pending changes before clearing the account-bound cache
   - stale/local backup corruption handling
4. **Browser hardening checks**
   - CSP presence and allowed origins
   - no direct localStorage usage outside wrapper module
5. **MCP OAuth security**
   - protected-resource and authorization-server discovery metadata
   - public dynamic registration with exact safe redirects
   - mandatory S256 PKCE, CSRF/state rejection, one-time five-minute codes, and server-specific callback binding
   - exact resource/audience and `emberlist.workspace` scope checks
   - one-hour access expiry, rotating refresh tokens, reuse detection, 90-day refresh expiry, and one-year grant expiry
   - revocation, immediate connected-client removal, rate limits, HTML escaping, and open-redirect rejection
   - encrypted Google refresh tokens, hashed bearer tokens, and absence of task content or raw tool arguments at rest and in logs
6. **MCP protocol and tools**
   - bearer challenges plus initialize, tools/list, and tools/call over Streamable HTTP
   - input schemas, read-only/destructive/idempotent annotations, pagination, concise structured responses, and database-outage behavior
   - required mutation IDs, 24-hour replay behavior, and content-free replay records
   - task/project/section/reminder/location CRUD, bulk changes, and tombstone versus hard-delete behavior
   - recurring completion/reopen, successor and reminder cloning, subtasks, deadlines, location reminders, DST, and duplicate repair
   - raw merge conflict reload, exact validated replacement, 2 MiB limit, referential/recurrence rejection, and stale-revision `409`
   - semantic Drive conflict retries are bounded to three attempts and the final write uses an atomic strong-ETag precondition
   - generated semantic payloads enforce the shared 2 MiB and entity-count limits before upload
   - deleted recurring continuations are not regenerated, and task deletion tombstones only the explicitly supplied task IDs
   - create responses identify the created entity; all writes return the affected entity, committed revision, and replay status
7. **Production integration**
   - [x] additive migration and transactional OAuth integration against disposable Neon branch `br-bitter-block-av6vn7j9`
   - [x] production main branch `br-billowing-shape-av2ohfej` contains migration state, all eight MCP tables, and production rows
   - [x] consent and connected-client Settings flows at 1440×900 and 390×844, including narrow FAB clearance and 2027 grant expiry
   - [x] connected-plugin create/edit/complete/reopen/export/no-op merge/guarded unchanged replacement/delete smoke, with active-result cleanup and tombstone verification
   - disposable-grant revocation and synchronization confirmation across web and Android

## Release gate

All mandatory security tests and checks pass before release candidate promotion.

## Current verification record

On August 21, 2026, `npm audit --audit-level=high`, lint (zero errors), 42
Vitest files with 298 tests, `npm run security:check`, and the production build
passed locally. Final production deployment
`dpl_GHipUDnEn1uPFjYt2h4f2tL7GSeK` reached Ready and was aliased to
`https://emberlist.dev`. The unauthenticated MCP endpoint remained `401` with its
protected-resource URL. Production privacy, terms, and security headers were
also verified. The signed-in Google Cloud console showed the exact MCP
callback under the Emberlist Web client's authorized redirect URIs. A connected plugin also passed a content-free
task-list/no-op/replay smoke without duplicating or changing workspace content.
`npm run test:mcp:postgres` passed against disposable Neon branch
`br-bitter-block-av6vn7j9`, covering the migration, encrypted refresh-token
storage and decryption, atomic one-time code consumption, refresh rotation race
and reuse retention, cleanup retention, and grant cascade deletion.
The signed-in Neon console showed `schema_migrations`, all eight MCP tables, and
production rows on main branch `br-billowing-shape-av2ohfej`, proving the
additive production migration is applied. Vercel environment listing showed
`DATABASE_URL`, `EMBERLIST_MCP_AUTH_SECRET`, `CRON_SECRET`, and
`EMBERLIST_MCP_ENABLED` configured for Production with no `VITE_` prefix;
values and secret entropy were not inspected.
Connected-client Settings and OAuth consent were visually verified at 1440×900
and 390×844. The narrow mobile FAB overlap was fixed and reverified, and the
grant-expiry presentation includes its 2027 date.

On August 24, 2026, the connected personal plugin completed the disposable
production mutation sequence: create, edit, complete, reopen, raw export,
no-op merge, guarded unchanged replacement, and delete. The created ID was
returned directly, each write returned a revision, the task was absent from
active results after deletion, and its normal sync tombstone remained visible
with `includeDeleted`.

This does not close the complete production-integration gate. The full
disposable-grant revocation smoke, cross-client web and Android sync
confirmation, and rollback rehearsal remain outstanding.
