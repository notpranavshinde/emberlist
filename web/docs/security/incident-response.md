# Security Incident Response

## Severity levels

- Sev 1: confirmed data/token exposure.
- Sev 2: active exploit path without confirmed exposure.
- Sev 3: suspected vulnerability requiring mitigation.

## Playbooks

1. **Token compromise suspicion**
   - disable sync entry point in UI build toggle
   - force disconnect guidance to users
   - publish advisory and rotate client config if required
2. **Malicious/corrupt sync payload propagation**
   - stop sync rollout
   - preserve forensic artifacts
   - ship validator/hardening patch and recovery guidance
3. **Third-party script compromise**
   - remove external dependency
   - enforce stricter CSP
   - incident communication and postmortem
4. **MCP token, grant, or authorization-service compromise**
   - set `EMBERLIST_MCP_ENABLED=false` to stop new authorization and workspace requests
   - send an authenticated `DELETE` to `/api/internal/mcp-cleanup` to delete every MCP grant, its encrypted Google credential, and its Emberlist access/refresh tokens
   - do not call Google token revocation as part of ordinary MCP rollback because the Google authorization is shared with normal web sync
   - rotate `EMBERLIST_MCP_AUTH_SECRET`, `CRON_SECRET`, and affected database credentials after grants are purged; rotate the normal web auth secret only if that separate boundary is affected
   - restore the prior Vercel deployment if code rollback is required; retain additive tables and do not run destructive down migrations
5. **MCP workspace content in logs or Postgres**
   - treat confirmed task content, raw arguments, bearer tokens, authorization codes, or Google credentials as a Sev 1 exposure
   - disable MCP, preserve access-controlled forensic evidence, stop the emitting path, and purge affected retained records under the incident owner's direction
   - determine affected grants and users without copying workspace content into the incident tracker

## MCP rollback verification

The production rollback sequence is not considered rehearsed until the kill
switch, authenticated all-grants deletion, prior-deployment restoration, and
post-rollback discovery/health behavior have been exercised and recorded. The
all-grants deletion is intentionally destructive and must not be used merely to
test route availability in a live environment.

## Post-incident

- timeline, root cause, mitigations, and prevention actions documented within 5 business days.
