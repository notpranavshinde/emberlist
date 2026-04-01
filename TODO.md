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
- [x] Add WorkManager sync triggers (startup, local changes).
  - [x] Manual sync now
  - [x] Enable/disable sync
  - [x] Last synced timestamp
  - [x] App startup sync
  - [x] Debounced local-change sync
  - [x] Periodic background sync
- [x] Add foreground/reconnect sync automation.
  - [x] Android sync on app foreground resume
  - [x] Android sync on connectivity regain
  - [x] Web sync on load
  - [x] Web sync on focus / visibility regain
  - [x] Web sync on reconnect
  - [x] Web debounced local-change sync
  - [x] Web visible-tab polling fallback
- [x] Add clearer sync runtime status.
  - [x] Pending local changes
  - [x] Offline waiting to sync
  - [x] Background/manual error state

## Phase 4: Web Client [DONE]
- [x] Build the web app in `/web` using React + TypeScript.
- [x] Shared data contract with Android.
- [x] Web storage model: IndexedDB for local cache.
- [x] Web sync flow matching Android (Download -> Merge -> Upload).
- [x] Material-3 inspired UI with Sidebar and TaskList.

## Phase 5: Validation
- [x] Android creates task offline -> later syncs to Drive -> Web receives it.
- [x] Web edits task -> Android merges and updates correctly.
- [x] Delete on one device does not resurrect on another.
- [ ] Simulate concurrent edits and verify deterministic winner selection.

## Done In This Slice
- Fully implemented the Web Client (`/web`) with React + Vite.
- Implemented `SyncEngine.ts` in TypeScript (Mirroring Android `SyncManager.kt`).
- Implemented `db.ts` using IndexedDB for offline-first web storage.
- Implemented `syncService.ts` for Google Drive AppData integration.
- Added "Import JSON" for manual testing and "Sync Cloud" for Google Drive sync.
- Reworked the web shell and task list presentation toward a Todoist-style desktop layout without changing the sync contract.
- Implemented Android manual Google Drive sync with one `emberlist_sync.json` file in appData.
- Added Android Google connect/disconnect, enable sync toggle, manual sync, and last synced state in Settings.
- Added Android `DriveAuthManager`, `DriveSyncService`, and service-level unit tests.
- Added Android `SyncWorker`, `SyncScheduler`, and `SyncCoordinator`.
- Implemented Android startup sync, debounced local-change sync, and periodic background sync.
- Added coordinator tests covering activation, local invalidation scheduling, suppression after recent sync, and disable cleanup.
- Added Android foreground/resume and reconnect sync scheduling.
- Added web auto-sync orchestration with debounce, silent auto-auth attempts, reconnect/focus/visibility triggers, and visible-tab polling.
- Added sync runtime status tracking for pending local changes, offline state, sync in progress, and errors.

## Web Feature Parity Backlog

### High Priority
- [x] Add global undo snackbar flows on web for task changes instead of banner-only recovery.
- [x] Add multi-select selection mode on Today.
- [x] Add bulk reschedule on Today.
- [x] Add bulk move-to-project on Today.
- [x] Add bulk priority change on Today.
- [x] Add bulk delete on Today.
- [x] Add a "reschedule overdue tasks" action on Today.
- [x] Make Today more operational instead of read-only, matching Android's task-management flow more closely.
- [x] Add web subtask creation.
- [x] Render subtasks nested under parent tasks on web.
- [x] Support bulk subtask creation from pasted lists on web.
- [x] Add drag-to-subtask interactions on web.
- [x] Expose the existing `parentId` task hierarchy in the web UI.
- [x] Render subtasks inside project sections on the web project page.

### Medium Priority
- [ ] Strengthen web task detail toward Android parity with a richer editing flow.
- [x] Add subtask list and subtask creation inside web task detail.
- [ ] Add reminder editing UI in web task detail.
- [ ] Add recurrence editing and removal UI in web task detail.
- [ ] Add explicit metadata controls to web Quick Add for project, priority, recurrence, and reminders.
- [ ] Keep Quick Add open for repeated task entry on web, while also letting `Esc` close it.

### Low Priority
- [ ] Add web project board view.
- [ ] Add a toggle between list and board view for projects on web.
- [ ] Add richer direct task operations in the web project view, including reschedule and stronger row actions.
- [ ] Add task-level activity timeline inside web task detail.
- [ ] Add parser-style inline task editing on web task detail for faster project and section assignment.
- [ ] Add richer undo behavior for archive, unarchive, and update flows in web task detail.
- [ ] Add multi-select selection mode on Upcoming.
- [ ] Add bulk reschedule on Upcoming.
- [ ] Add bulk move-to-project on Upcoming.
- [ ] Add bulk priority change on Upcoming.
- [ ] Add bulk delete on Upcoming.
- [ ] Add gesture-driven scheduling interactions on Upcoming.
- [x] Add drag-to-subtask behavior on Upcoming.
- [ ] Make Upcoming more action-oriented, closer to Android's management flow.
- [ ] Add multi-select selection mode in Search.
- [ ] Add bulk task actions from Search results.
- [ ] Add subtask-aware Search result presentation with flattened parent/subtask rendering.
- [ ] Make Search more action-oriented, closer to Android's behavior.
- [ ] Add deadline recurrence UI in web task detail.
- [ ] Strengthen post-create reminder and recurrence management surfaces on web beyond parser-only entry.
- [ ] Improve deadline and scheduling controls on web task detail to better match Android.
- [ ] Add week-start preference to web Settings.
- [ ] Add 24-hour time preference to web Settings.
- [ ] Expand web Settings with richer sync and backup controls closer to Android.
- [ ] Add JSON export or equivalent backup/export flow on web.
- [ ] Make web project and task flows more operational without requiring detail-page round trips.

### Recommended Implementation Order
1. [x] Build a shared web task-selection state and bulk-action infrastructure.
   - Scope: selection mode, selected-task state, shared bulk action bar, shared task-list checkbox affordances.
   - Why first: Today, Upcoming, and Search bulk actions all depend on the same foundation.
2. [x] Add a shared web undo system.
   - Scope: snackbar/toast UI, action queue, undo handlers for complete, reopen, reschedule, move, priority, delete, archive, and section changes.
   - Why second: bulk actions become much safer once undo exists.
3. [x] Implement Today bulk workflows.
   - Scope: multi-select, bulk reschedule, bulk move-to-project, bulk priority change, bulk delete, and reschedule-overdue action.
   - Why third: highest-value operational screen and the user-marked top priority area.
4. [ ] Expose task hierarchy in the shared web data/view layer.
   - Scope: parent/child selectors, nested rendering helpers, flatten/expand behavior, and parent-aware task mutations.
   - Why fourth: subtasks affect task lists, task detail, projects, Today, Upcoming, and Search.
   - Progress: shared hierarchy selectors, nested rendering helpers, and parent-aware reparent mutations are in place; expand/collapse behavior is still pending.
5. [x] Add subtask creation and rendering in task detail and project views.
   - Scope: create subtasks, nested display, pasted bulk subtask creation, and subtasks inside project sections.
   - Why fifth: delivers the core subtask feature set without drag complexity yet.
6. [x] Add drag-to-subtask interactions.
   - Scope: parent drop targets, hierarchy reassignment, and safety rules for invalid nesting.
   - Why sixth: depends on existing visible hierarchy and subtask mutation support.
7. [ ] Upgrade Quick Add and task detail editing surfaces.
   - Scope: repeated-entry Quick Add, `Esc` close behavior, explicit metadata controls, reminder UI, recurrence UI, and stronger task detail editing.
   - Why seventh: builds on the shared task mutation patterns and hierarchy support.
8. [ ] Add project-page operational parity.
   - Scope: richer row actions, direct reschedule, and improved in-project task operations.
   - Why eighth: safer after undo, hierarchy, and task-editing improvements are already in place.

### Dependency Notes
- Bulk actions should be built once in shared web task-list primitives, not separately per page.
- The shared row-selection primitives now exist in the web task list and are ready to be reused in Upcoming and Search.
- Undo should cover both single-task and bulk-task mutations before expanding task-management UI further.
- Subtasks should land before Search and Upcoming parity work, because those screens need hierarchy-aware rendering.
- Board view is intentionally deferred until the shared hierarchy and task-operation model is stable.
