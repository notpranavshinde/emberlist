---
name: emberlist-development
description: Implement, diagnose, review, or validate changes in the Emberlist Android and web repository. Use for Emberlist code, tests, architecture, security, sync, or release work; do not use for managing a user's Emberlist workspace.
---

# Emberlist Development

Treat the repository's `AGENTS.md` files as authoritative. Read the root guide and any more-specific guide covering files in scope before editing. Preserve unrelated work, and do not commit, push, deploy, publish, or release unless the user explicitly asks.

## Classify the change

Choose every applicable class; overlapping classes require the union of their checks.

- **Android:** Kotlin, Compose, Room, WorkManager, reminders, or Android tests.
- **Web:** React/TypeScript, IndexedDB, serverless APIs, web configuration, or web tests.
- **Cross-client:** sync payloads, parsing, recurrence, serialized data, defaults, merge or repair logic, or data models shared by Android and web.
- **Security-sensitive:** authentication, OAuth, analytics, storage, sync APIs, public endpoints, cookies, admin access, retention, or third-party processors.
- **Release-sensitive:** CI, signing, deployment, release configuration, or distributable artifacts.

## Preserve architecture contracts

- Android workspace content lives in Room; web workspace content lives in IndexedDB. The web API is an OAuth, Drive, analytics, and admin boundary—not a separate task database.
- Treat sync fields, serialized names, enums, defaults, deletion strategies, recurrence rules, and analytics schemas as versioned cross-client contracts.
- Preserve cloud-sync, manual/private-backup, and Android OS-backup boundaries. Cloud sync excludes activity history; OS backup must not acquire workspace content or sync identity.
- A Room schema change requires a database version bump, a registered non-destructive migration, an exported schema snapshot, and a real upgrade-path test.
- Route web `localStorage` access through the repository's storage helper. Never expose server secrets through `VITE_` variables or log private task data.

## Validate

- Android production or test changes: run `:app:compileDebugKotlin` and `:app:testDebugUnitTest` at minimum.
- Android UI changes: also exercise the affected flow on an emulator and run relevant connected tests when a target is available.
- Web source, API, configuration, or tests: run `npm ci`, `npm audit --audit-level=high`, `npm run lint`, `npm test`, `npm run security:check`, and `npm run build` from `web/`.
- Web UI, onboarding, routing, or responsive layout: additionally test the affected flow at desktop and narrow mobile widths and capture visual evidence.
- Cross-client changes: run relevant Android and web tests plus both clients' normal validation. Add compatibility regressions for the changed contract.
- Security, authentication, analytics, storage, or sync API changes: read the relevant material in `web/docs/security/`, update required security documentation, and add security-focused tests.
- Release or signing changes: follow the repository guide's release checks and verify signatures before calling an artifact distributable.

In the handoff, list the commands that ran, what passed, and any required check that could not run with the exact limitation.
