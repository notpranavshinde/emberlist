# Emberlist

Emberlist is a Google Drive-backed task manager for Android and the web with fast task entry, projects, reminders, recurring work, and backups.

- Use the web app: [emberlist.dev](https://emberlist.dev)
- Download Android: [emberlist-release.apk](https://github.com/notpranavshinde/emberlist/releases/download/android-latest/emberlist-release.apk)
- View Android releases: [android-latest](https://github.com/notpranavshinde/emberlist/releases/tag/android-latest)
- Install the Codex plugin: [emberlist.dev/plugin](https://emberlist.dev/plugin)

## Current state

The Android and web clients are functional and share the same task and sync format.

Android includes the complete device experience: task and project management, natural-language entry, recurring tasks, notifications, background scheduling, private backups, and automatic Google Drive sync.

The web client includes the main workspace, task and project editing, search, bulk actions, JSON backup tools, an account-bound browser cache, and automatic Google Drive sync. Its public serverless entry points are under `web/api/`; shared Drive and MCP route handlers live under `web/server/` and are bundled through those entry points.

Open release work is tracked in [`TODO.md`](TODO.md).

## Features

- Inbox, Today, Upcoming, Search, projects, sections, lists, and boards
- Natural-language task entry for dates, deadlines, priorities, projects, recurrence, and reminders
- Subtasks, bulk task entry, multi-select actions, and undo
- Recurring due dates and deadlines
- Android reminder notifications with complete, snooze, and open actions
- JSON export and import
- Seven-file retention for private Android backups
- Mandatory account onboarding and automatic sync through Google Drive `appDataFolder`

## Storage and sync

Android keeps an account-bound workspace cache in Room. The web client keeps an account-bound workspace cache in IndexedDB. A Google account with Drive app-data access is required before either workspace can be used; returning users can keep editing cached data during a temporary outage.

Both clients automatically exchange a versioned `SyncPayload` through one hidden `emberlist_sync.json` file in the user's Drive app-data folder. Merge behavior is deterministic, uses deletion tombstones, and repairs invalid references after conflicts.

The web serverless API handles OAuth, Drive sync, and the remote MCP endpoint at `https://emberlist.dev/api/mcp`. Vercel rewrites the MCP URLs to the existing `web/api/drive/sync-file.js` function, which dispatches to handlers in `web/server/mcp/`. It does not maintain a task database: MCP workspace content remains in the user's Drive file. Postgres stores only OAuth/security metadata, hashed tokens, encrypted grant credentials, and content-free mutation replay records. Android system backup and device transfer exclude task content, locations, sync identity, and private JSON snapshots; only non-content settings are eligible.

The public [privacy policy](https://emberlist.dev/privacy) and [terms of service](https://emberlist.dev/terms) describe Codex access, retention, and disconnection. Security questions can be sent to `support@emberlist.dev`.

Security documentation is in [`web/docs/security/`](web/docs/security/).

## Codex plugin

The repository includes a personal Codex plugin for managing an Emberlist workspace and for repository-aware development guidance. It is distributed from this GitHub repository rather than OpenAI's public plugin directory.

```bash
codex plugin marketplace add notpranavshinde/emberlist --ref main
codex plugin add emberlist@emberlist
```

Start a new Codex task after installation and authorize Emberlist when prompted. See the [installation and update guide](docs/codex-plugin.md) for updates, removal, permissions, and troubleshooting.

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
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
EMBERLIST_AUTH_SECRET=at-least-32-random-bytes
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
EMBERLIST_MCP_AUTH_SECRET=a-different-32-byte-random-secret
EMBERLIST_MCP_ENABLED=false
CRON_SECRET=another-random-secret
ANALYTICS_ID_SECRET=a-different-32-byte-random-secret
EMBERLIST_ADMIN_AUTH_SECRET=another-32-byte-random-secret
EMBERLIST_ANALYTICS_ADMIN_EMAILS=admin@example.com
EMBERLIST_APP_ORIGIN=http://localhost:3000
```

Production deployments should set `EMBERLIST_APP_ORIGIN=https://emberlist.dev` and configure `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for distributed rate limiting and anonymous aggregate analytics. Add both `https://emberlist.dev/api/admin/auth/google/callback` and `https://emberlist.dev/api/mcp/oauth/google/callback` to the Google web OAuth client. Apply the additive MCP migrations with `npm run db:migrate` before changing the staged default `EMBERLIST_MCP_ENABLED=false` to `true`. The authenticated daily cleanup route is `/api/internal/mcp-cleanup`; an authenticated `DELETE` to the same route is the emergency all-grants revocation control. The private dashboard is available at `emberlist.dev/#/stats`; it requests only Google profile/email access and is independent of Drive authorization.

## Testing

Android:

```powershell
.\gradlew.bat :app:compileDebugKotlin
.\gradlew.bat test
.\gradlew.bat connectedAndroidTest
```

Google Drive authorization tests must use the real Google provider. Keep a
dedicated QA Google account signed in to a Google Play AVD, leave the AVD data
intact between runs, and save a snapshot after the account has signed in and
granted Emberlist access. Install updates with `adb install -r` using APKs signed
by the same key so Android preserves both the app data and Google account. Never
commit the QA account credentials or tokens, wipe the AVD, or use `-no-snapshot`
for this QA target.

Run a real-provider smoke test when OAuth clients, signing certificates,
requested scopes, Play services, or the authorization integration changes.

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
- `web/api/` — public serverless entry points
- `web/server/` — shared Drive and MCP handlers bundled by the serverless entry points
- `web/tests/` — API security tests
- `web/docs/security/` — security and release documentation
- `plugins/emberlist/` — installable Codex plugin bundle
- `.agents/plugins/marketplace.json` — repository marketplace manifest
- `.github/workflows/` — CI and signed Android releases
