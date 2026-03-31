# Emberlist (Offline Task Manager)

Emberlist is an offline-first task manager built around fast capture, local-first data, and deterministic sync. It now has a functional Android client and a functional web client sharing the same `SyncPayload` contract and Google Drive appData sync file, so the same workspace can be used across Android and the browser without a custom backend.

## Features

- Offline‑first local database
- Functional web client with routed `Today`, `Upcoming`, `Search`, `Browse`, `Inbox`, Project, Task, and Settings screens
- Quick Add with live parsing (due, deadline, priority, project, recurrence, reminders)
- Bulk paste in Quick Add: paste a multi-line list and create one task or one task per line
- Live project suggestions when typing `#`
- Inbox, Today (with Overdue), Upcoming (grouped by date)
- Projects with sections
- List + Board views for projects
- Drag‑and‑drop between sections in Board view
- Parser-first task detail editor (quick-parser + notes, subtasks, overflow actions, collapsed activity)
- Task archive/unarchive
- Subtasks in task detail
- Bulk paste subtasks from task detail with the same one-vs-many confirmation flow
- Task activity log with per-entry undo and specific change labels
- Recurring tasks (due + deadline recurrence)
- Time‑based reminders with notifications
- Reminder notifications validate task/reminder state before firing and support working Complete / Snooze 10m / Open actions
- Optional completed section on Today
- Notification actions (complete, snooze)
- Swipe actions on tasks (reschedule via date picker, delete with confirmation)
- Search
- Search smart filters (multi-select)
- Backup export/import (JSON)
- Google Drive sync through Drive appData
- Clear completed tasks

## Current Status

- Android app is the most complete client.
- Web app is now functional for daily task/project use:
  - browse inbox and projects
  - create projects and sections
  - create, edit, complete, archive, and delete tasks
  - search tasks with practical filters
  - sync to the same Google Drive appData file as Android
  - reset web cache and reset cloud sync for recovery
- Web parity is not complete yet:
  - Android-style quick parser is not implemented on web yet
  - activity history is still Android-first
  - location reminder authoring/editing is still Android-first

## Architecture

- **UI**: Jetpack Compose + Navigation Compose
- **State**: MVVM with `StateFlow`
- **Data**: Room (local-first Room database on Android)
- **Background**: AlarmManager for exact reminders, WorkManager fallback
- **Sync**: `SyncPayload` + `SyncManager` for deterministic merges, Google Drive appData for manual cloud sync
- **Packages**:
  - `data` (Room entities, DAO, database, repositories, backup)
  - `domain` (recurrence engine, task actions)
  - `ui` (screens/components/theme)
  - `reminders` (scheduling + notifications)
  - `parsing` (Quick Add parser)

### Key flows
- Quick Add parses text live into due/deadline/priority/project/recurrence/reminder chips.
- Completing a recurring task generates the next instance via `RecurrenceEngine` (due + deadline recurrence supported).
- Reminders are scheduled through `ReminderScheduler` (AlarmManager; WorkManager fallback).
- Reminders are cancelled immediately when tasks are completed/archived or reminder sets change, and stale alarms are ignored on receipt.
- Export/import uses JSON via `BackupManager`.
- Cloud sync uses a separate `SyncPayload` and writes `emberlist_sync.json` to Google Drive appData.
- Task detail uses the same parser model as Quick Add for live metadata edits, and logs buffered change summaries instead of every keystroke.
- Repeating tasks can be ended from task detail with a "Complete forever" action that completes the current task and stops future recurrence.

## Multi-Device Sync Status

### Done so far
- Android entities are sync-safe:
  - `deletedAt` tombstones on tasks, projects, and sections
  - `updatedAt` on reminders and locations
- Android Room migrations support the sync metadata.
- Normal Android app queries hide tombstoned rows.
- Android repository deletes are soft deletes for syncable entities.
- `SyncPayload` is a first-class transport format, separate from local backup payloads.
- `SyncManager` performs deterministic merge on Android:
  - last-writer-wins by `updatedAt`
  - tombstones beat older live rows
  - invalid references are repaired after merge
- Android Google Drive sync is implemented:
  - Google connect/disconnect
  - enable/disable sync
  - manual `Sync now`
  - app-startup sync
  - debounced local-change sync
  - periodic background sync
  - last synced timestamp
  - one Drive appData file: `emberlist_sync.json`
- Web client exists in `web/` and is being developed against the same sync contract.

### Not done yet
- Full Android feature parity on web
- More end-to-end conflict validation and sync UX hardening
- Cleaner production configuration around web deployment and OAuth setup

## Android + Web Sync Build Plan

### Phase 1: Data contract and merge safety
These pieces are already in place on Android and should remain the contract for both clients.

1. Keep `SyncPayload` authoritative for cloud sync.
2. Treat `activity` as local-only, not replicated state.
3. Use soft deletes with `deletedAt` instead of hard deletion for syncable entities.
4. Use `updatedAt` on every syncable row that can independently change.
5. Merge snapshots with deterministic rules:
   - newer `updatedAt` wins
   - tombstones beat older live rows
   - missing rows do not imply deletion
6. Repair invalid references after merge:
   - clear dead project/section/parent links on tasks
   - drop reminders for deleted or invalid tasks
   - drop invalid location references

### Phase 2: Android cloud sync completion
The Android app now supports manual sync plus automatic startup/background triggers. The next Android steps should focus on hardening and validation.

1. Harden Android sync UX:
   - clearer sync state text
   - last error details
   - visible “sync in progress” state
2. Add more Android sync tests:
   - startup sync worker behavior
   - local-change debounce behavior against real DB writes
   - periodic worker scheduling/constraints
   - repeated manual taps do not overlap
3. Verify real-device Google account flows:
   - auth restore after app restart
   - disconnect/reconnect
   - sync behavior when Drive permission is revoked externally

### Phase 3: Web client completion
The web client should follow the same payload and merge rules as Android. Do not invent a second sync model.

1. Keep local-first storage in IndexedDB.
2. Load local cache first, then sync against Drive.
3. Use the same Google Cloud project and Drive scope as Android.
4. Use the same filename and location:
   - `emberlist_sync.json`
   - Google Drive `appDataFolder`
5. Ensure the web merge flow is identical:
   - download remote payload
   - merge local + remote
   - upload merged payload
   - persist merged result locally
6. Build out the remaining web product surface:
   - auth/session restore
   - sync status UI
   - task/project editing parity where needed
   - import/export tools for testing and recovery

### Phase 4: Cross-device validation
These are the important end-to-end cases still to verify.

1. Android creates tasks offline, later syncs, and web receives them.
2. Web edits tasks, Android syncs, and local DB reflects the merged result.
3. Deletes on one device do not resurrect on another.
4. Concurrent edits resolve deterministically.
5. Reminder/task integrity survives merge:
   - no orphan reminders
   - no invalid project/section links
   - no broken parent/subtask references

## Project Setup

1. Open the project root in Android Studio.
2. Let Gradle sync.
3. Run the `app` configuration on an emulator or device (Android 8+).

## Web Setup

The web client lives in [`web/`](./web).

1. Install dependencies:
   - `cd web`
   - `npm install`
2. Configure the web OAuth client:
   - create `web/.env.local`
   - add `VITE_GOOGLE_CLIENT_ID=your-web-oauth-client-id.apps.googleusercontent.com`
3. Start the dev server:
   - `npm run dev`
4. Build for production:
   - `npm run build`

Example env file:

```bash
VITE_GOOGLE_CLIENT_ID=your-web-oauth-client-id.apps.googleusercontent.com
```

### Build variants
- `debug`: default for development
- `release`: non‑minified by default

## Data Model (Room)

Entities live in `app/src/main/java/com/notpr/emberlist/data/model/Models.kt`.
- `ProjectEntity`
- `SectionEntity`
- `TaskEntity`
- `ReminderEntity`
- `ActivityEventEntity`

Room database: `EmberlistDatabase` in `app/src/main/java/com/notpr/emberlist/data/EmberlistDatabase.kt` with migrations `1 -> 2`, `2 -> 3`, `3 -> 4`, `4 -> 5`, and `5 -> 6`.

## Reminders

- Exact reminders use `AlarmManager.setExactAndAllowWhileIdle`.
- If exact alarms aren’t allowed, schedules a `WorkManager` one‑time job.
- Notification actions: Complete, Snooze 10 minutes, Open task.

## Backup / Restore

- Export creates a single JSON file via system file picker.
- Import supports **Replace** (wipe and restore) or **Merge** (dedupe by IDs is implicit because IDs are UUIDs).

## Google Drive Sync

- Android currently supports:
  - manual sync from Settings
  - app-startup sync when sync is enabled and Drive access is available
  - debounced sync after local DB changes while the app is running
  - periodic background sync via WorkManager
- Settings also includes a `Reset cloud sync` action that deletes the hidden Drive appData sync file if it becomes corrupted during testing. Local data is left untouched; the next sync recreates the file.
- Sync writes one hidden file named `emberlist_sync.json` to the user's Google Drive appData folder.
- Setup required:
  - Enable the Google Drive API in your Google Cloud project.
  - Configure an Android OAuth client for this package name and SHA-1.
  - Configure the corresponding web OAuth client in the same Google Cloud project.
  - Use the same Google Cloud project and Drive scope as the web client.
  - Keep Android and web pointed at the same `SyncPayload` contract and the same Drive appData file.
  - For the web client, configure `VITE_GOOGLE_CLIENT_ID` with the web OAuth client ID.
  - Add every browser origin you will use to the web OAuth client’s **Authorized JavaScript origins**.
    - Development examples:
      - `http://localhost:5173`
      - `http://127.0.0.1:5173`
    - Production example:
      - `https://emberlist.yourdomain.com`

## Deploying The Web App

Emberlist’s web client is a static Vite app. That means you do not need a custom backend just to use it from another computer. The browser stores a local IndexedDB cache on each machine, and cross-device state is shared through Google Drive appData sync.

### What you need

1. A public HTTPS URL for the web app.
2. A Google web OAuth client in the same Google Cloud project as Android sync.
3. That deployment URL added to the OAuth client’s **Authorized JavaScript origins**.
4. The same Google account signed in on both devices if you want both devices to use the same Drive-backed workspace.

### Simplest hosting options

- Vercel:
  - import the repo
  - set the web root to `web/` if deploying as a separate project
  - build command: `npm run build`
  - output directory: `dist`
  - environment variable: `VITE_GOOGLE_CLIENT_ID=...`
- Cloudflare Pages:
  - import the repo
  - build command: `npm run build`
  - output directory: `dist`
  - environment variable: `VITE_GOOGLE_CLIENT_ID=...`

### Recommended first production path

1. Push the repo to GitHub.
2. Deploy `web/` to Vercel or Cloudflare Pages.
3. Add the deployed HTTPS origin to the Google web OAuth client.
4. Set `VITE_GOOGLE_CLIENT_ID` in the host’s environment settings.
5. Open the deployed site on your other computer.
6. Sign in with the same Google account and run `Sync now`.

### Practical behavior after deployment

- Each computer has its own local browser cache.
- Google Drive appData is the shared cloud state.
- If you add/change tasks on one machine, sync there, then sync on the other machine, the other machine will pull the merged workspace.
- Because sync is currently explicit on web, you should treat `Sync now` as part of the workflow when switching devices.

## Tests

- Unit tests:
  - `QuickAddParserTest`
  - `RecurrenceEngineTest`
- Instrumentation tests:
  - `QuickAddFlowTest`
  - `TodayViewTest`

Run:
```bash
./gradlew test
./gradlew connectedAndroidTest
```

## Manual Test Checklist

1. **Create task offline**
   - Open app with airplane mode on
   - Add task via Quick Add
   - Verify it appears in Inbox
2. **Quick Add parsing**
   - Enter: `Pay rent tomorrow 8am p1 #Home remind me 30m before`
   - Ensure chips appear and task is created with parsed fields
   - Enter: `Task every 2 days` and `Task this weekend`
   - Ensure recurrence and due date are parsed correctly
3. **Quick Add chip editing**
   - Tap Due/Deadline/Priority/Project/Repeat/Reminders chips and edit values
   - Verify created task uses edited values
   - Paste a multi-line list into Quick Add
   - Verify Emberlist prompts to add 1 task or one task per line
   - Verify common bullets like `-` and `*` are stripped, while numbered prefixes are preserved
4. **Today + Upcoming**
   - Create tasks due today and future
   - Today shows today + overdue
   - Upcoming groups by date
   - Drag a task up/down in Upcoming to reschedule by −1/+1 day
   - Swipe left on a task and pick a reschedule date
   - Swipe right on a task to delete with confirmation
5. **Recurring tasks**
   - Create a task with `every day`
   - Complete it, verify a new instance appears for next day
   - Create a task with `deadline every friday`
   - Complete it, verify the next instance includes the next deadline
6. **Reminders**
   - Add reminder: `remind me at 6pm`
   - Verify notification fires
   - Tap snooze and verify it fires 10 minutes later
   - Delete or complete the task and verify the reminder does not fire later
   - Remove a reminder from task detail and verify old notifications do not reappear after reboot/time change
7. **Task detail edits**
   - Open a task and edit it through the parser field
   - Verify due/project/priority/reminder/recurrence changes reflect in Today/Upcoming
   - Verify notes still edit separately
   - Verify Activity shows specific labels like due/reminder/priority changes and allows undo
   - Paste a multi-line list into Add subtask
   - Verify Emberlist prompts to add 1 subtask or one subtask per line
8. **Board toggle + drag**
   - Open a project and toggle between List/Board
   - Drag a task card between section columns
9. **Backup/Restore**
   - Export JSON
   - Clear app data
   - Import JSON and verify tasks/projects restored
10. **Google Drive sync**
   - Connect Google from Settings
   - Enable sync and tap Sync now
   - Verify sync completes and Last synced updates
   - Make a change on web, sync again on Android, and verify the local DB updates
11. **Project + section management**
   - Create, rename, and archive projects from Browse
   - Create, rename, and delete sections in a project
12. **Settings data tools**
   - Clear completed tasks and verify they are removed
13. **Task deletion**
   - Open a task and delete from Task Detail

## Notes

- The Android app now supports manual Google Drive sync plus automatic startup/background sync triggers.
- The sync architecture is now split cleanly:
  - `BackupPayload` for user backup/export/import
  - `SyncPayload` for replicated cloud state
- The remaining sync work is mostly around automatic triggers, UX hardening, and end-to-end validation, not inventing a new merge model.
- Board view supports drag‑and‑drop between section columns.
