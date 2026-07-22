# Emberlist

Emberlist is a task manager for Android and the web with fast task entry, projects, reminders, recurring work, backups, and optional Google Drive sync.

- Use the web app: [emberlist.dev](https://emberlist.dev)
- Download Android: [emberlist-release.apk](https://github.com/notpranavshinde/emberlist/releases/download/android-latest/emberlist-release.apk)
- View Android releases: [android-latest](https://github.com/notpranavshinde/emberlist/releases/tag/android-latest)

## Current state

The Android and web clients are functional and share the same task and sync format.

Android includes the complete device experience: task and project management, natural-language entry, recurring tasks, notifications, background scheduling, local backups, and Google Drive sync.

The web client includes the main workspace, task and project editing, search, bulk actions, JSON backup tools, local browser storage, and Google Drive sync. Its OAuth and Drive operations use the serverless endpoints in `web/api/`.

Open release work is tracked in [`TODO.md`](TODO.md).

## Features

- Inbox, Today, Upcoming, Search, projects, sections, lists, and boards
- Natural-language task entry for dates, deadlines, priorities, projects, recurrence, and reminders
- Subtasks, bulk task entry, multi-select actions, and undo
- Recurring due dates and deadlines
- Android reminder notifications with complete, snooze, and open actions
- JSON export and import
- Seven-file retention for private Android backups
- Optional Android and web sync through Google Drive `appDataFolder`

## Storage and sync

Android stores its workspace in Room. The web client stores its workspace in IndexedDB.

When Google Drive sync is enabled, both clients exchange a versioned `SyncPayload` through one hidden `emberlist_sync.json` file in the user's Drive app-data folder. Merge behavior is deterministic, uses deletion tombstones, and repairs invalid references after conflicts.

The web serverless API handles OAuth and Drive requests but does not maintain a separate task database. Android system backup and device transfer exclude task content, locations, sync identity, and private JSON snapshots; only non-content settings are eligible.

Security documentation is in [`web/docs/security/`](web/docs/security/).

## Android development

Requirements:

- JDK 17
- Android SDK 34
- Android Studio or Gradle

Windows:

```powershell
.\gradlew.bat :app:compileDebugKotlin
.\gradlew.bat test
.\gradlew.bat installDebug
```

macOS and Linux:

```bash
./gradlew :app:compileDebugKotlin
./gradlew test
./gradlew installDebug
```

Android 8.0 (API 26) is the minimum supported version. Debug and release builds use different signing keys and cannot update one another in place.

## Web development

Requirements:

- Node.js 24
- npm

```bash
cd web
npm ci
npm run dev
```

The Vite server runs the client UI. Google sign-in and Drive sync also require a local serverless-function runtime for `web/api/`.

Web configuration:

```dotenv
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
EMBERLIST_AUTH_SECRET=at-least-32-random-bytes
ANALYTICS_ID_SECRET=a-different-32-byte-random-secret
EMBERLIST_ADMIN_AUTH_SECRET=another-32-byte-random-secret
EMBERLIST_ANALYTICS_ADMIN_EMAILS=notpranavshinde@gmail.com
EMBERLIST_APP_ORIGIN=http://localhost:3000
```

Production deployments should also configure `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for rate limiting and anonymous aggregate analytics. Add `https://emberlist.dev/api/admin/auth/google/callback` to the Google web OAuth client. The private dashboard is available at `emberlist.dev/#/stats`; it requests only Google profile/email access and is independent of Drive authorization.

## Testing

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

The web workflow runs these checks and generates a CycloneDX SBOM. The Android release workflow runs JVM tests before producing the signed APK.

## Repository layout

- `app/` — Android application and tests
- `web/src/` — web client
- `web/api/` — OAuth and Drive sync endpoints
- `web/tests/` — API security tests
- `web/docs/security/` — security and release documentation
- `.github/workflows/` — CI and signed Android releases
