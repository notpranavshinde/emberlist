# Emberlist Repository Guide

This file applies to the entire repository. Keep changes focused, preserve unrelated work, and follow any more-specific `AGENTS.md` found below the directory you are editing.

## Repository Map

- `app/` — Android application built with Kotlin, Jetpack Compose, Room, WorkManager, and Google Drive sync.
- `app/src/main/java/com/notpr/emberlist/` — Android production code:
  - `data/` — Room, repositories, backup, settings, onboarding, analytics, and sync.
  - `domain/` — task actions, recurrence, and activity logging.
  - `parsing/` — quick-add and bulk-entry parsing.
  - `reminders/` — alarms, workers, receivers, and notifications.
  - `ui/` — Compose screens, components, themes, and ViewModels.
- `app/src/main/res/` — Android drawables, mipmaps, values, themes, and XML configuration. The app uses Compose rather than XML layouts.
- `app/src/test/` — JVM tests using JUnit, Robolectric, coroutine test utilities, and Room testing.
- `app/src/androidTest/` — device/emulator UI and instrumentation tests.
- `app/schemas/` — committed Room schema snapshots.
- `web/src/` — React and TypeScript client. Workspace entities live in IndexedDB; device-local preferences, onboarding state, analytics queues/IDs, and short-lived state may use browser storage.
- `web/api/` — JavaScript serverless endpoints for OAuth, Drive sync, analytics, and admin access.
- `web/tests/` — API and security-focused tests. Additional unit tests are colocated with web source as `*.test.ts` or `*.test.js`.
- `web/docs/security/` — web security architecture, threat model, test matrix, and release guidance.
- `qa/` — manual QA fixtures.
- `.github/workflows/` — web CI and signed Android release automation.
- `README.md` — product, development, and architecture overview. `TODO.md` tracks known release issues.

Do not edit generated or dependency output such as `.gradle/`, any `build/` directory, `web/node_modules/`, or `web/dist/`. Change the source or configuration that produces it.

## Architecture and Compatibility

- Android stores the workspace in Room; web stores it in IndexedDB.
- Both clients exchange the same versioned sync payload through Google Drive `appDataFolder`. Any sync field, enum, default, deletion strategy, or serialized name is a versioned cross-client change. Update Android and web serializers, merge/repair logic, schema constants, API validation, and compatibility tests together. Make backward/forward compatibility and rollout decisions explicit; do not assume every entity collection uses tombstones.
- Preserve the three backup boundaries: cloud sync uses `SyncPayload` without activity history; Android manual/private backups use `BackupPayload` and may include activity; Android OS backup/device transfer includes only non-content settings. Do not add workspace data, locations, sync identity, or private JSON snapshots to Android backup rules.
- Room schema changes must bump the database version, add and register a non-destructive migration, update the exported snapshot in `app/schemas/`, and test an actual upgrade path for user-content preservation.
- Recurrence changes must preserve cross-client rule interpretation, all-day/time-zone/DST behavior, successor idempotence, deadline offsets, reminder cloning, and post-sync duplicate repair.
- Reminders, quick-add parsing, backup/import, authentication, analytics, and conflict resolution are also high-risk areas. Add regression tests for behavioral changes.
- The web API handles OAuth and Drive operations but is not a separate task database. Preserve the trust boundaries described in `web/docs/security/`.

## Development Commands

Run commands from the repository root unless noted otherwise.

### Android

Android development requires JDK 17 and Android SDK 34.

```powershell
.\gradlew.bat :app:compileDebugKotlin
.\gradlew.bat :app:testDebugUnitTest
.\gradlew.bat installDebug
.\gradlew.bat connectedAndroidTest
```

On macOS/Linux, use `./gradlew` with the same tasks.

`connectedAndroidTest` requires a connected device or emulator. Activity startup and some Compose selectors are currently known to be unreliable on connected targets; if the task cannot run or fails, report the exact limitation instead of claiming the suite passed or dismissing the failure as device-only.

### Web

Web development requires Node.js 24 and npm.

```bash
cd web
npm ci
npm run dev
```

Local web verification:

```bash
cd web
npm ci
npm audit --audit-level=high
npm run lint
npm test
npm run security:check
npm run build
```

Use `npm ci` for verification. Only change `package-lock.json` through an intentional dependency change. Web CI additionally generates and uploads a CycloneDX SBOM after these checks.

## Validation by Change Type

- Documentation-only change: proofread links, paths, commands, and configuration names; no build is required.
- Android production or test change: run `:app:compileDebugKotlin` and `:app:testDebugUnitTest` at minimum.
- Android UI or instrumentation change: also run the relevant `connectedAndroidTest` coverage when a device/emulator is available.
- Web source, API, configuration, or test change: run the full web verification sequence above.
- Web UI, onboarding, routing, or responsive-layout change: after the automated checks, exercise the affected flow at desktop and narrow mobile widths; include screenshots/GIFs or report why browser validation could not run.
- Cross-client sync, parsing, recurrence, or data-model change: run relevant Android and web tests, then the normal validation for both affected clients.
- Android release or signing change: run `:app:testDebugUnitTest` and `:app:assembleRelease`. Before describing an APK as signed or distributable, verify its signature with `apksigner`; a release build without credentials may be unsigned.
- CI, release, authentication, or security change: validate the affected workflow/configuration and follow the relevant documentation under `web/docs/security/`.

Do not silently skip required checks. In the final handoff, list what ran, what passed, and anything that could not run.

## Code and Test Conventions

### Android

- Use Kotlin with 4-space indentation and follow the surrounding Compose style.
- Use `PascalCase` for classes, composables, ViewModels, and screens; `camelCase` for functions and variables; `UPPER_SNAKE_CASE` for constants.
- Give screens and ViewModels explicit names such as `TodayScreen` and `TodayViewModel`.
- Keep business logic out of composables when it belongs in a ViewModel, domain class, repository, parser, or scheduler.
- Name tests `*Test.kt` and use descriptive behavior-oriented test names.

### Web

- Follow the existing file-local TypeScript/React style; the codebase currently contains more than one indentation/semicolon style, so nearby code and ESLint are authoritative.
- Use `PascalCase` for React components and types, and `camelCase` for functions and variables.
- Keep browser/domain logic in `web/src/lib/` when it can be tested independently of React.
- Serverless API code uses ECMAScript modules. Keep authentication, authorization, origin, cookie, and rate-limit checks explicit and testable.
- Colocate focused unit tests as `*.test.ts`/`*.test.js`; keep endpoint-level coverage under `web/tests/`.

There is no repository-wide autoformatter. Keep diffs minimal, follow nearby code, and do not perform unrelated formatting or refactors.

## Security and Configuration

- Never commit secrets, access tokens, private task data, real sync payloads, keystores, or credentials.
- Keep `local.properties`, `.env`, `.android-signing/`, `*.keystore`, and `*.jks` local and untracked. Examples and documentation must use placeholders.
- Android release signing uses `EMBERLIST_RELEASE_STORE_FILE`, `EMBERLIST_RELEASE_STORE_PASSWORD`, `EMBERLIST_RELEASE_KEY_ALIAS`, and `EMBERLIST_RELEASE_KEY_PASSWORD`, or the ignored `.android-signing/keystore.properties` file.
- Web configuration includes Google OAuth, Emberlist auth/analytics secrets, admin allowlists, application origin, and Upstash rate-limiting credentials. For configuration changes, derive supported variables from source and update safe placeholders/documentation in `README.md`, `web/README.md`, `web/.env.example`, relevant security docs, and `TODO.md` status together.
- Do not expose secret server-side variables through `VITE_` names. Values prefixed with `VITE_` are bundled for the browser.
- Treat Drive OAuth and analytics-admin OAuth as separate trust boundaries. Do not share their scopes, session/state handling, secrets, or authorization logic. The `#/stats` route must remain standalone and must not initialize the task workspace or record product analytics.
- Treat product-analytics schema versions, event/property names, enum values, identity/reset behavior, and retention as an Android/web/API/reporting contract. Never send task titles, notes, project names, emails, or raw identifiers as analytics.
- For auth, analytics, storage, or sync API work, read the relevant material in `web/docs/security/` and add or update security-focused tests. New public endpoints, OAuth flows, cookies, admin surfaces, external processors, identifiers, or retention behavior must update the applicable threat model, ADR, test matrix, launch checklist, and privacy disclosure in the same change.
- Route web `localStorage` access through `web/src/lib/webStorage.ts` so security checks and storage behavior remain centralized.

## Commits and Handoff

- Do not commit, push, publish, deploy, or create a release unless the user explicitly requests it.
- When asked to commit, use a short imperative message such as `Fix reminder parsing`.
- Pull requests should summarize behavior changes, call out schema/configuration/security effects, include screenshots or GIFs for visible UI changes, and report validation results or the reason a check could not run.
