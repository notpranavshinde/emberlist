# Security Event Taxonomy

Track and alert on:

- repeated OAuth failures (`popup_closed`, permission denied, timeout)
- repeated sync payload validation failures
- repeated local recovery/reset actions
- CSP violation reports
- repeated MCP registration, authorization, PKCE, audience, token-refresh, or bearer failures
- refresh-token reuse detection and grant revocation
- repeated Drive revision conflicts, invalid raw replacements, and oversized MCP payloads
- authenticated cleanup failures and database availability failures

The current MCP audit table stores only an event name, timestamp, and optional
surrogate client and grant identifiers. Recorded names cover registration,
authorization, audience, token, bearer, grant-issuance, refresh-token-reuse, and
grant-revocation outcomes. It does not store request bodies, failure messages,
IP addresses, OAuth tokens, or workspace content. Audit writes are best effort
so a telemetry outage does not change an OAuth result. Retain these records for
30 days. Mutation replay records may retain only a request hash and result
identifiers for 24 hours.

Never log or store task content, titles, notes, project names, locations, raw
tool arguments, workspace payloads, bearer tokens, authorization codes, or
Google credentials. Keep product analytics entirely free of MCP workspace data.

The authenticated daily cleanup removes expired authorization state, token and
grant records, mutation replay records older than 24 hours, and audit events
older than 30 days. Alerting and operational review of these content-free events
remain required before broad multi-user launch.
