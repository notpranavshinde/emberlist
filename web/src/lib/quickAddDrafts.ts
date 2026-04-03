import type { QuickAddResult, ReminderSpec as ParsedReminderSpec } from './quickParser';
import type { SyncPayload } from '../types/sync';
import {
  getActiveProjects,
  getProjectById,
  getProjectSections,
  type TaskDraft,
  type TaskReminderDraft,
} from './workspace';

export type QuickAddContext = {
  defaultProjectId: string | null;
  defaultSectionId: string | null;
  defaultDueToday: boolean;
};

export function buildDraftFromParsed(
  payload: SyncPayload,
  parsed: QuickAddResult,
  description: string,
  context: QuickAddContext,
  todayStartMs: number,
): TaskDraft {
  const projectMatch = parsed.projectName
    ? getActiveProjects(payload, true).find(project => project.name.localeCompare(parsed.projectName!, undefined, { sensitivity: 'base' }) === 0) ?? null
    : null;
  const contextProjectId = !parsed.projectName ? context.defaultProjectId : null;
  const projectId = projectMatch?.id ?? contextProjectId ?? null;
  const sectionMatch = projectId
    ? (
      parsed.sectionName
        ? getProjectSections(payload, projectId).find(section => section.name.localeCompare(parsed.sectionName!, undefined, { sensitivity: 'base' }) === 0) ?? null
        : getProjectSections(payload, projectId).find(section => section.id === context.defaultSectionId) ?? null
    )
    : null;
  const dueAt = parsed.dueAt ?? (context.defaultDueToday ? todayStartMs : null);
  const allDay = parsed.dueAt === null && context.defaultDueToday ? true : parsed.allDay;

  return {
    title: parsed.title.trim(),
    description: description.trim(),
    projectId,
    projectName: projectMatch ? null : parsed.projectName,
    sectionId: sectionMatch?.id ?? null,
    sectionName: sectionMatch ? null : parsed.sectionName,
    priority: parsed.priority,
    dueAt,
    allDay,
    deadlineAt: parsed.deadlineAt,
    deadlineAllDay: parsed.deadlineAllDay,
    recurringRule: parsed.recurrenceRule,
    deadlineRecurringRule: parsed.deadlineRecurringRule,
    parentTaskId: null,
    reminders: parsed.reminders.map(mapParsedReminder),
  };
}

export function createMergedBulkDraft(
  payload: SyncPayload,
  lines: string[],
  description: string,
  context: QuickAddContext,
  todayStartMs: number,
): TaskDraft {
  const baseDraft = buildDraftFromParsed(payload, {
    title: '',
    dueAt: null,
    deadlineAt: null,
    allDay: true,
    deadlineAllDay: false,
    priority: 'P4',
    projectName: null,
    sectionName: null,
    recurrenceRule: null,
    deadlineRecurringRule: null,
    reminders: [],
  }, description, context, todayStartMs);

  return {
    ...baseDraft,
    title: lines.join(' ').trim() || 'Untitled task',
  };
}

export function mergeBulkDraftWithDefaults(
  lineDraft: TaskDraft,
  defaultDraft: TaskDraft,
  inputLine: string,
): TaskDraft {
  const hasPriorityToken = /\bp[1-4]\b/i.test(inputLine);

  return {
    ...lineDraft,
    dueAt: lineDraft.dueAt ?? defaultDraft.dueAt,
    deadlineAt: lineDraft.deadlineAt ?? defaultDraft.deadlineAt,
    allDay: lineDraft.dueAt === null ? defaultDraft.allDay : lineDraft.allDay,
    deadlineAllDay: lineDraft.deadlineAt === null ? defaultDraft.deadlineAllDay : lineDraft.deadlineAllDay,
    priority: hasPriorityToken ? lineDraft.priority : defaultDraft.priority,
    projectId: lineDraft.projectId ?? defaultDraft.projectId,
    projectName: lineDraft.projectId || lineDraft.projectName ? lineDraft.projectName : defaultDraft.projectName,
    sectionId: lineDraft.sectionId ?? defaultDraft.sectionId,
    sectionName: lineDraft.sectionId || lineDraft.sectionName ? lineDraft.sectionName : defaultDraft.sectionName,
    recurringRule: lineDraft.recurringRule ?? defaultDraft.recurringRule,
    deadlineRecurringRule: lineDraft.deadlineRecurringRule ?? defaultDraft.deadlineRecurringRule,
    reminders: lineDraft.reminders.length ? lineDraft.reminders : defaultDraft.reminders,
  };
}

export function describeQuickAddProject(payload: SyncPayload, draft: TaskDraft): string {
  if (draft.projectId) {
    return getProjectById(payload, draft.projectId)?.name ?? 'Current project';
  }
  if (draft.projectName) {
    return `Create "${draft.projectName}"`;
  }
  return 'Inbox';
}

function mapParsedReminder(reminder: ParsedReminderSpec): TaskReminderDraft {
  return reminder.kind === 'ABSOLUTE'
    ? { kind: 'ABSOLUTE', timeAt: reminder.timeAt }
    : { kind: 'OFFSET', offsetMinutes: reminder.minutes };
}
