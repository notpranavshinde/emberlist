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
   - legacy SPA auth fallback remains opt-in only
3. **Storage safety**
   - local cache reset behavior
   - stale/local backup corruption handling
4. **Browser hardening checks**
   - CSP presence and allowed origins
   - no direct localStorage usage outside wrapper module

## Release gate
All mandatory security tests and checks pass before release candidate promotion.
