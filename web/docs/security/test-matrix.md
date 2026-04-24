# Security Test Matrix

## Mandatory tests
1. **Payload validation abuse tests**
   - malformed schema
   - prototype-pollution style objects
   - unexpected enum values and types
2. **OAuth/sync resilience**
   - token refresh failures
   - insufficient permissions handling
   - network and timeout behavior
3. **Storage safety**
   - local cache reset behavior
   - stale/local backup corruption handling
4. **Browser hardening checks**
   - CSP presence and allowed origins
   - no direct localStorage usage outside wrapper module

## Release gate
All mandatory security tests and checks pass before release candidate promotion.
