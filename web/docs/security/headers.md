# Production Security Headers Baseline

## Required headers
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(), camera=(), microphone=()`

## CSP target policy (example)
Use deployment headers (preferred) or HTML meta fallback:

```text
default-src 'self';
script-src 'self' https://accounts.google.com;
connect-src 'self' https://www.googleapis.com https://accounts.google.com;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
img-src 'self' data:;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
object-src 'none';
```

## Rollout
1. Run as `Content-Security-Policy-Report-Only`.
2. Triage/allowlist legitimate violations.
3. Enforce CSP before GA rollout.
