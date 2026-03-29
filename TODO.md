# TODO - Emberlist Multi-Device Sync Plan

## Goal
- Make Emberlist work across Android + Web without running an Emberlist backend.
- Use Google Drive as a dumb file store, not as an app server.
- Keep the app offline-first: local DB is always usable without network.

## Phase 1: Make The Data Sync-Safe [DONE]
- [x] Add tombstones for deletions.
- [x] Add missing sync metadata (`updatedAt`, `deletedAt`).
- [x] Define the sync payload as a first-class versioned format (`SyncPayload`).
- [x] Remove `activity` from sync v1 for simplicity.

## Phase 2: Build A Real Sync Engine [DONE]
- [x] Create `SyncManager` (Android) and `SyncEngine` (Web) that merges snapshots.
- [x] Implement merge rules: last-writer-wins, tombstones win, deterministic tie-breaking.
- [x] Implement post-merge repair: cleaning up invalid references (projects, sections, parents).
- [x] Unit-test the merge engine.

## Phase 3: Android Cloud Sync [IN PROGRESS]
- [x] Implement `DriveSyncService` using Google Drive appData.
- [x] Add auth + settings UI (Sign in with Google).
- [ ] Add WorkManager sync triggers (startup, local changes).
  - [x] Manual sync now
  - [x] Enable/disable sync
  - [x] Last synced timestamp
  - [ ] App startup sync
  - [ ] Debounced local-change sync
  - [ ] Periodic background sync

## Phase 4: Web Client [DONE]
- [x] Build the web app in `/web` using React + TypeScript.
- [x] Shared data contract with Android.
- [x] Web storage model: IndexedDB for local cache.
- [x] Web sync flow matching Android (Download -> Merge -> Upload).
- [x] Material-3 inspired UI with Sidebar and TaskList.

## Phase 5: Validation
- [ ] Android creates task offline -> later syncs to Drive -> Web receives it.
- [ ] Web edits task -> Android merges and updates correctly.
- [ ] Delete on one device does not resurrect on another.
- [ ] Simulate concurrent edits and verify deterministic winner selection.

## Done In This Slice
- Fully implemented the Web Client (`/web`) with React + Vite.
- Implemented `SyncEngine.ts` in TypeScript (Mirroring Android `SyncManager.kt`).
- Implemented `db.ts` using IndexedDB for offline-first web storage.
- Implemented `syncService.ts` for Google Drive AppData integration.
- Added "Import JSON" for manual testing and "Sync Cloud" for Google Drive sync.
- Implemented Android manual Google Drive sync with one `emberlist_sync.json` file in appData.
- Added Android Google connect/disconnect, enable sync toggle, manual sync, and last synced state in Settings.
- Added Android `DriveAuthManager`, `DriveSyncService`, and service-level unit tests.
