export const AUTO_SYNC_DEBOUNCE_MS = 5_000;
export const AUTO_SYNC_QUIET_PERIOD_MS = 10_000;

export type AutoSyncState = {
  autoSyncEnabled: boolean;
  hasCloudSession: boolean;
};

export type DebouncedSyncRequest = {
  autoSyncEnabled: boolean;
  hasCloudSession: boolean;
  isOnline: boolean;
  isSyncing: boolean;
  applyingRemoteChanges: boolean;
  lastSyncedAt: number | null;
  now: number;
  syncQuietPeriodMs?: number;
};

export function isAutoSyncActive(state: AutoSyncState): boolean {
  return state.autoSyncEnabled && state.hasCloudSession;
}

export function shouldRunActivationSync(previous: AutoSyncState, current: AutoSyncState): boolean {
  return !isAutoSyncActive(previous) && isAutoSyncActive(current);
}

export function shouldRunForegroundSync(wasForeground: boolean, isForeground: boolean, state: AutoSyncState): boolean {
  return isAutoSyncActive(state) && !wasForeground && isForeground;
}

export function shouldRunConnectivityRegainSync(wasOnline: boolean, isOnline: boolean, state: AutoSyncState): boolean {
  return isAutoSyncActive(state) && !wasOnline && isOnline;
}

export function shouldScheduleDebouncedSync(request: DebouncedSyncRequest): boolean {
  return resolveDebouncedSyncDelay(request) !== null;
}

export function resolveDebouncedSyncDelay(request: DebouncedSyncRequest): number | null {
  const quietPeriodMs = request.syncQuietPeriodMs ?? AUTO_SYNC_QUIET_PERIOD_MS;
  if (!isAutoSyncActive(request)) return null;
  if (!request.isOnline || request.isSyncing || request.applyingRemoteChanges) return null;
  const quietPeriodRemaining = request.lastSyncedAt === null
    ? 0
    : Math.max(0, request.lastSyncedAt + quietPeriodMs - request.now);
  return Math.max(AUTO_SYNC_DEBOUNCE_MS, quietPeriodRemaining);
}
