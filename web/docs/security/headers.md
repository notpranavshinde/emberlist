# Production Security Headers Baseline

## Required headers
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(), camera=(), microphone=()`

## CSP target policy (example)
Set CSP via HTTP response headers in production.

`frame-ancestors` is not enforced from a `<meta http-equiv="Content-Security-Policy">` tag, so clickjacking protection must be delivered from the hosting layer (for example Vercel headers config).

```text
default-src 'self';
script-src 'self' https://accounts.google.com;
connect-src 'self' https://www.googleapis.com https://accounts.google.com;
frame-src https://accounts.google.com/gsi/;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
img-src 'self' data:;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
object-src 'none';
```

## Rollout
1. Run as `Content-Security-Policy-Report-Only` from HTTP headers.
2. Triage/allowlist legitimate violations.
3. Enforce CSP before GA rollout.
