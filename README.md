# Emberlist (Offline Task Manager)

Emberlist is a single‑device, offline‑first Android task manager inspired by Todoist’s workflow. It ships with fast capture, Inbox/Today/Upcoming, projects with sections, time‑based reminders, recurring due/deadlines, and local backup/restore.

## Architecture

- **UI**: Jetpack Compose + Navigation Compose
- **State**: MVVM with `StateFlow`
- **Data**: Room (local, offline only)
- **Background**: AlarmManager for exact reminders, WorkManager fallback
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
- Export/import uses JSON via `BackupManager`.

## Project Setup

1. Open the project root in Android Studio.
2. Let Gradle sync.
3. Run the `app` configuration on an emulator or device (Android 8+).

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

Room database: `EmberlistDatabase` in `app/src/main/java/com/notpr/emberlist/data/EmberlistDatabase.kt` with migrations `1 -> 2` and `2 -> 3`.

## Reminders

- Exact reminders use `AlarmManager.setExactAndAllowWhileIdle`.
- If exact alarms aren’t allowed, schedules a `WorkManager` one‑time job.
- Notification actions: Complete, Snooze 10 minutes, Open task.

## Backup / Restore

- Export creates a single JSON file via system file picker.
- Import supports **Replace** (wipe and restore) or **Merge** (dedupe by IDs is implicit because IDs are UUIDs).

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
7. **Task detail edits**
   - Open a task, set priority, due/deadline, recurrence, reminders, and save
   - Verify updates reflect in Today/Upcoming
8. **Board toggle + drag**
   - Open a project and toggle between List/Board
   - Drag a task card between section columns
9. **Backup/Restore**
   - Export JSON
   - Clear app data
   - Import JSON and verify tasks/projects restored
10. **Project + section management**
   - Create, rename, and archive projects from Browse
   - Create, rename, and delete sections in a project
11. **Settings data tools**
   - Clear completed tasks and verify they are removed
12. **Task deletion**
   - Open a task and delete from Task Detail

## Notes

- This app is **offline‑only**. No login, no sync, no accounts.
- Board view supports drag‑and‑drop between section columns.
