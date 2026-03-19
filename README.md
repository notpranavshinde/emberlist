# Emberlist (Offline Task Manager)

Emberlist is a single‑device, offline‑first Android task manager inspired by Todoist’s workflow. It ships with fast capture, Inbox/Today/Upcoming, projects with sections, time‑based reminders, recurring due/deadlines, and local backup/restore.

## Features

- Offline‑first (no accounts, no sync)
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
- Clear completed tasks

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
- Reminders are cancelled immediately when tasks are completed/archived or reminder sets change, and stale alarms are ignored on receipt.
- Export/import uses JSON via `BackupManager`.
- Task detail uses the same parser model as Quick Add for live metadata edits, and logs buffered change summaries instead of every keystroke.
- Repeating tasks can be ended from task detail with a "Complete forever" action that completes the current task and stops future recurrence.

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

Room database: `EmberlistDatabase` in `app/src/main/java/com/notpr/emberlist/data/EmberlistDatabase.kt` with migrations `1 -> 2`, `2 -> 3`, `3 -> 4`, and `4 -> 5`.

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
