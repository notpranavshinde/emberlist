import type { SyncPayload } from '../types/sync';
import { SyncEngine } from './syncEngine';
import { repairRecurringTasks } from './workspace';

export type LocalPersistReconciliation = {
  payload: SyncPayload;
  repairedCount: number;
  removedDuplicateCount: number;
};

export function reconcileLocalPersistPayload(
  storedPayload: SyncPayload,
  nextPayload: SyncPayload,
  nowProvider: () => number = () => Date.now(),
): LocalPersistReconciliation {
  const syncEngine = new SyncEngine(nowProvider, 'web');
  const mergedPayload = syncEngine.mergePayloads(storedPayload, nextPayload);
  return repairRecurringTasks(mergedPayload);
}
