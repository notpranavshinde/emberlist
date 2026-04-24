# Dependency Security Policy

## CI requirements
- Lockfile must be committed and deterministic.
- Run vulnerability scan on every PR and release build.
- Generate SBOM for release artifacts.

## Blocking thresholds
- Critical: block release.
- High: block unless explicit exception approved.
- Medium/Low: ticket with SLA.

## Patch SLAs
- Critical: 48 hours.
- High: 7 days.
- Medium: 30 days.

## Exceptions
Exceptions require:
1. Impact/risk statement.
2. Compensating controls.
3. Expiration date.
4. Owner approval.
