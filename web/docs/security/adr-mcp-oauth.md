# ADR: Remote MCP OAuth and Workspace Access

## Status

Accepted for the Emberlist remote MCP rollout on August 21, 2026.

## Context

Codex clients need delegated access to an Emberlist workspace while the
workspace remains in the user's Google Drive `appDataFolder`. Clients are public
OAuth clients and cannot safely hold a client secret. The existing Google OAuth
client and web session already establish the Google identity and Drive grant.

## Decision

- Expose a Streamable HTTP MCP resource at `https://emberlist.dev/api/mcp` with
  RFC 9728 protected-resource metadata and RFC 8414 authorization-server
  metadata. Vercel rewrites all public MCP URLs to
  `web/api/drive/sync-file.js`, which dispatches to `web/server/mcp/**`; this
  keeps a single serverless entry point without changing the public interface.
- Support public dynamic client registration, exact registered redirects,
  mandatory S256 PKCE, one-time five-minute authorization codes, exact resource
  matching, and RFC 9207 issuer identification.
- Use one application scope, `emberlist.workspace`. Accept `offline_access` only
  as a protocol request for refresh tokens.
- Reuse an active Emberlist web session during consent. Otherwise use the
  existing Google OAuth client and the dedicated MCP callback, then create the
  normal web session.
- Issue one-hour access tokens and rotating 90-day refresh tokens with reuse
  detection. End every grant after one year. Store only token hashes.
- Store OAuth clients, requests, codes, grants, mutation replay metadata,
  migrations, and security events in provider-neutral Postgres. Encrypt the
  Google refresh token with `EMBERLIST_MCP_AUTH_SECRET`. Never persist workspace
  payloads or raw tool arguments.
- Deleting an MCP grant invalidates its Emberlist tokens and deletes the
  encrypted credential. It does not call Google token revocation because the
  Google client and authorization are shared with ordinary web sync.
- Require mutation IDs for all writes. Preserve Drive data integrity through
  signed revision tokens and operation-specific conflict behavior.

## Consequences

The authorization service is stateful through Postgres while MCP request
handling remains stateless on Vercel. A database outage prevents OAuth and
mutation replay checks but does not move or copy the workspace out of Drive.
The broad workspace scope makes consent and connected-client revocation
especially important. Exact raw replacement remains available only for explicit
requests and fails rather than repairing or retrying a stale or invalid payload.

## Rollout and rollback

Apply additive migrations and deploy with `EMBERLIST_MCP_ENABLED=false`. Verify
metadata and health, register the Google callback, then enable MCP and run the
disposable end-to-end smoke test. Roll back by disabling MCP, revoking grants,
and restoring the prior Vercel deployment. Do not run destructive down
migrations.

On August 21, 2026, final production deployment
`dpl_GHipUDnEn1uPFjYt2h4f2tL7GSeK` reached Ready and was aliased to
`https://emberlist.dev`. Live metadata advertised RFC 9207 issuer-response
support, and the unauthenticated MCP challenge remained `401` with the
protected-resource URL. The signed-in Google Cloud console showed the exact MCP callback
under the Emberlist Web client's authorized redirect URIs. A connected plugin passed a content-free smoke covering a default
task list, a no-op semantic mutation, and an identical replay without duplicate
or workspace-content change. Desktop and narrow mobile Settings/consent layouts
were visually verified after correcting FAB overlap. The broader
disposable-workspace smoke, cross-client verification, and rollback rehearsal
remain release gates.
