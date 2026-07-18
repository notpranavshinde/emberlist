# Emberlist

Emberlist is an offline-first task manager for Android and the web. It combines fast natural-language capture, projects, reminders, recurring tasks, backups, and optional Google Drive sync without requiring an Emberlist-hosted task database.

- Web app: [emberlist.dev](https://emberlist.dev)
- Latest signed Android APK: [download](https://github.com/notpranavshinde/emberlist/releases/download/android-latest/emberlist-release.apk)
- Android release page: [android-latest](https://github.com/notpranavshinde/emberlist/releases/tag/android-latest)

## Highlights

- Local-first storage: Room on Android and IndexedDB on the web
- Inbox, Today, Upcoming, Search, projects, sections, list views, and boards
- Natural-language task entry for dates, deadlines, priorities, projects, recurrence, and reminders
- Subtasks, bulk entry, multi-select actions, undo, and activity history
- Time-based Android notifications with complete, snooze, and open actions
- JSON export, import, and private local Android backups
- Optional cross-device sync through the user's Google Drive `appDataFolder`
- Deterministic conflict resolution with tombstones and reference repair

Android has the deepest device integration, including notifications and background scheduling. The web client supports the core workspace, task-management, backup, and sync workflows.

## Data and privacy

Emberlist remains usable offline. Local data is authoritative until the user chooses to sync.

Google Drive sync is optional. When enabled, Emberlist stores one hidden `emberlist_sync.json` file in the user's Drive app-data folder. The web deployment uses a server-side OAuth code flow and encrypted, secure cookies; it does not maintain a separate Emberlist task database.

Android system backup and device transfer include only non-content settings. The task database, location data, sync identity, and private JSON snapshots are excluded. Manual JSON export remains available for user-controlled backups.

Security design notes, the threat model, and the release checklist live in [`web/docs/security/`](web/docs/security/).

## Repository layout

- `app/src/main/java/` — Kotlin, Jetpack Compose, Room, sync, reminders, and domain logic
- `app/src/main/res/` — Android resources and backup rules
- `app/src/test/` — Android JVM tests
- `app/src/androidTest/` — Android instrumentation and Compose UI tests
- `web/src/` — React and TypeScript web client
- `web/api/` — serverless OAuth and Google Drive sync endpoints
- `web/tests/` — web API security and validation tests
- `.github/workflows/` — Android release and web verification workflows

## Android development

### Requirements

- JDK 17
- Android SDK 34
- Android Studio or Gradle with an emulator/USB-debuggable device

Build and test from the repository root:

```powershell
.\gradlew.bat :app:compileDebugKotlin
.\gradlew.bat test
.\gradlew.bat installDebug
.\gradlew.bat connectedAndroidTest
```

On macOS or Linux, replace `.\gradlew.bat` with `./gradlew`.

Android 8.0 (API 26) is the minimum supported version. Debug and signed release builds use different signing keys, so Android will not install one over the other. Export or sync important local data before uninstalling an existing build.

### Signed APK releases

The `Android Signed APK` GitHub Actions workflow builds the release APK. It uses repository secrets for the release keystore and can update the stable `android-latest` release.

## Web development

### Requirements

- Node.js 24
- npm

Install and run the client:

```bash
cd web
npm ci
npm run dev
```

`npm run dev` runs the Vite client. Google OAuth and Drive sync also require a local runtime that serves the functions in `web/api/`, such as Vercel's development runtime.

For Google sync, configure:

```dotenv
VITE_GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-web-client-secret
EMBERLIST_AUTH_SECRET=at-least-32-random-bytes
EMBERLIST_APP_ORIGIN=http://localhost:3000
```

`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are optional locally and recommended in production for distributed rate limiting.

Production builds intentionally reject the legacy browser-token auth mode.

## Web deployment

The checked-in `web/vercel.json` configures SPA rewrites and security headers for Vercel.

For production:

1. Deploy with `web/` as the project root and `dist/` as the output directory.
2. Set `VITE_GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `EMBERLIST_AUTH_SECRET`, and `EMBERLIST_APP_ORIGIN`.
3. Add the deployment callback, such as `https://emberlist.dev/api/auth/google/callback`, to the Google OAuth client's authorized redirect URIs.
4. Configure Upstash Redis credentials if rate limits must be shared across serverless instances.
5. Run the security and production-build checks before promotion.

## Verification

Android:

```powershell
.\gradlew.bat :app:compileDebugKotlin
.\gradlew.bat test
.\gradlew.bat connectedAndroidTest
```

Web:

```bash
cd web
npm ci
npm audit --audit-level=high
npm run lint
npm test
npm run security:check
npm run build
```

Web CI runs the locked install, dependency audit, lint, tests, security checks, production build, and CycloneDX SBOM generation.

## Backup and recovery

Android Settings provides:

- JSON export and import
- Replace or merge import behavior
- Daily private local backup
- Manual **Backup now** and **Restore backup** actions
- Retention of the seven newest private backups
- Cloud-sync reset without deleting local task data

The web client provides local workspace export/import and cache/cloud recovery controls.

## Open work

Current release and deployment follow-ups are tracked in [`TODO.md`](TODO.md). Completed project history belongs in Git and release notes rather than the active TODO or README.
