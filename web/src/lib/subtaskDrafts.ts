import type { SyncPayload, Task } from '../types/sync';
import { buildDraftFromParsed, createMergedBulkDraft, type QuickAddContext } from './quickAddDrafts';
import { parseQuickAdd } from './quickParser';
import type { TaskDraft } from './workspace';

function createSubtaskContext(parentTask: Task): QuickAddContext {
  return {
    defaultProjectId: parentTask.projectId,
    defaultSectionId: parentTask.sectionId,
    defaultDueToday: false,
  };
}

export function buildSubtaskDraft(
  payload: SyncPayload,
  parentTask: Task,
  input: string,
  todayStartMs: number,
  description: string = '',
): TaskDraft {
  return {
    ...buildDraftFromParsed(
      payload,
      parseQuickAdd(input),
      description,
      createSubtaskContext(parentTask),
      todayStartMs,
    ),
    parentTaskId: parentTask.id,
  };
}

export function buildBulkSubtaskDrafts(
  payload: SyncPayload,
  parentTask: Task,
  lines: string[],
  todayStartMs: number,
): TaskDraft[] {
  return lines.map(line => buildSubtaskDraft(payload, parentTask, line, todayStartMs));
}

export function buildCombinedSubtaskDraft(
  payload: SyncPayload,
  parentTask: Task,
  lines: string[],
  todayStartMs: number,
): TaskDraft {
  return {
    ...createMergedBulkDraft(
      payload,
      lines,
      '',
      createSubtaskContext(parentTask),
      todayStartMs,
    ),
    parentTaskId: parentTask.id,
  };
}
