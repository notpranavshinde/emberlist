# TODO - Emberlist Web & Sync Plan

## Phase 1: Sync Engine Logic
- [ ] Create a `SyncManager` that can merge two `BackupPayload` objects.
    - [ ] Use `updatedAt` to decide which version of an entity (Task, Project, Section) is the "winner."
    - [ ] Handle deletions: If an entity exists in one payload but is missing in another, should it be deleted? (May need a "deletedAt" field or "archived" state).
- [ ] Unit tests for `SyncManager` to ensure no data loss during merge.

## Phase 2: Android Cloud Integration (Google Drive)
- [ ] Research & Setup Google Drive Android SDK credentials.
- [ ] Implement `GoogleDriveService` for uploading/downloading `emberlist_sync.json`.
- [ ] Add a background worker (WorkManager) to auto-sync:
    - [ ] Trigger on local database changes (with a debounce).
    - [ ] Check for remote changes on app startup.
- [ ] UI for "Enable Cloud Sync" in Settings.

## Phase 3: Web Application (The "Computer Version")
- [ ] Scaffold a **Compose for Web** or **React** project in a new `/web` directory.
- [ ] Share data models between Android and Web (Move models to a common module if possible).
- [ ] Build the Web UI:
    - [ ] Sidebar for Projects.
    - [ ] Task list view (Material 3 style).
    - [ ] Task editor/details view.
- [ ] Local storage for Web (IndexedDB or just in-memory while testing).

## Phase 4: Web Cloud Integration
- [ ] Integrate Google Drive JS API on the website.
- [ ] Implement the "Login with Google" flow.
- [ ] Wire up the `SyncManager` logic on the web side to handle `emberlist_sync.json`.
- [ ] Final validation: Create a task on Android -> Refresh Web -> See task appear.

## Maintenance & Refinements
- [ ] Add "Last Synced" timestamp in the UI.
- [ ] Conflict resolution UI (If two changes happen at the exact same time).
- [ ] Support for other cloud providers (OneDrive, Dropbox) as alternatives.
