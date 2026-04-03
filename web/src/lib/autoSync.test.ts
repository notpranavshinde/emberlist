import { describe, expect, it } from 'vitest';
import {
  AUTO_SYNC_QUIET_PERIOD_MS,
  isAutoSyncActive,
  shouldRunActivationSync,
  shouldRunConnectivityRegainSync,
  shouldRunForegroundSync,
  shouldScheduleDebouncedSync,
} from './autoSync';

describe('autoSync policy', () => {
  it('becomes active only when sync is enabled and a cloud session exists', () => {
    expect(isAutoSyncActive({ autoSyncEnabled: false, hasCloudSession: true })).toBe(false);
    expect(isAutoSyncActive({ autoSyncEnabled: true, hasCloudSession: false })).toBe(false);
    expect(isAutoSyncActive({ autoSyncEnabled: true, hasCloudSession: true })).toBe(true);
  });

  it('requests a startup sync when sync becomes active', () => {
    expect(
      shouldRunActivationSync(
        { autoSyncEnabled: false, hasCloudSession: true },
        { autoSyncEnabled: true, hasCloudSession: true },
      ),
    ).toBe(true);
  });

  it('schedules debounced syncs for local changes only when active', () => {
    expect(
      shouldScheduleDebouncedSync({
        autoSyncEnabled: true,
        hasCloudSession: true,
        isOnline: true,
        isSyncing: false,
        applyingRemoteChanges: false,
        lastSyncedAt: null,
        now: 1_000,
      }),
    ).toBe(true);
  });

  it('suppresses debounced syncs shortly after a successful sync', () => {
    expect(
      shouldScheduleDebouncedSync({
        autoSyncEnabled: true,
        hasCloudSession: true,
        isOnline: true,
        isSyncing: false,
        applyingRemoteChanges: false,
        lastSyncedAt: 995,
        now: 1_000,
        syncQuietPeriodMs: AUTO_SYNC_QUIET_PERIOD_MS,
      }),
    ).toBe(false);
  });

  it('does not schedule debounced syncs for remote-import changes', () => {
    expect(
      shouldScheduleDebouncedSync({
        autoSyncEnabled: true,
        hasCloudSession: true,
        isOnline: true,
        isSyncing: false,
        applyingRemoteChanges: true,
        lastSyncedAt: null,
        now: 1_000,
      }),
    ).toBe(false);
  });

  it('runs immediate syncs on foreground and connectivity regain when active', () => {
    const state = { autoSyncEnabled: true, hasCloudSession: true };

    expect(shouldRunForegroundSync(false, true, state)).toBe(true);
    expect(shouldRunConnectivityRegainSync(false, true, state)).toBe(true);
  });
});
