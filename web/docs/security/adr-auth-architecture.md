# ADR: Web Authentication Architecture

## Status
Accepted (interim): Keep SPA token model with compensating controls.

## Context
The web client currently requests Google OAuth tokens in-browser (`DriveSyncService`) and calls Google APIs directly.

## Decision
Remain on SPA direct-token architecture for this release cycle with strict controls:
- Harden CSP and security headers.
- Minimize third-party scripts and enforce dependency governance.
- Maintain in-memory token handling only (no token persistence).
- Add security monitoring for auth/sync anomalies.

## Alternatives considered
- **BFF token broker**: reduces browser token exposure but adds backend complexity, session/CSRF concerns, and operational overhead.

## Consequences
- Faster release and less infrastructure.
- Higher sensitivity to XSS/dependency compromise, requiring stronger browser hardening and release checks.

## Revisit trigger
Reassess before next major scale milestone or if threat model risk score rises.
