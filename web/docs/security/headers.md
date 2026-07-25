# Production Security Headers Baseline

## Required headers
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(), camera=(), microphone=()`

## CSP target policy (example)
Set CSP via HTTP response headers in production (configured in `web/vercel.json`).

`frame-ancestors` is not enforced from a `<meta http-equiv="Content-Security-Policy">` tag, so clickjacking protection must be delivered from the hosting layer (for example Vercel headers config).

```text
default-src 'self';
script-src 'self';
connect-src 'self';
frame-src 'none';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
img-src 'self' data:;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
object-src 'none';
```

The browser reaches Google through top-level OAuth redirects. Google API calls happen only in Vercel functions, so Google script, frame, and connection origins are not allowed by the application CSP.

## Rollout
1. Run as `Content-Security-Policy-Report-Only` from HTTP headers.
2. Triage/allowlist legitimate violations.
3. Enforce CSP before GA rollout.
