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

## Post-incident
- timeline, root cause, mitigations, and prevention actions documented within 5 business days.
