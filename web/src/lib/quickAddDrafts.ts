import { parseQuickAdd, type QuickAddResult, type ReminderSpec as ParsedReminderSpec } from './quickParser';
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
  relativeAnchorTaskId?: string | null;
  relativePosition?: 'before' | 'after' | null;
  editTaskId?: string | null;
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

export function buildTaskDetailDraftFromInput(
  payload: SyncPayload,
  input: string,
  description: string,
  context: QuickAddContext,
  todayStartMs: number,
): TaskDraft {
  const parsed = resolveTaskDetailParsedResult(payload, input);
  const draft = buildDraftFromParsed(
    payload,
    parsed,
    description,
    context,
    todayStartMs,
  );

  if (draft.projectId !== null || !parsed.projectName || !hasWhitespace(parsed.projectName)) {
    return draft;
  }

  const fallbackProjectToken = parsed.projectName.split(/\s+/)[0] ?? '';
  const fallbackProject = getActiveProjects(payload, true).find(project =>
    project.name.localeCompare(fallbackProjectToken, undefined, { sensitivity: 'base' }) === 0
  );
  if (!fallbackProject) {
    return draft;
  }

  return {
    ...draft,
    projectId: fallbackProject.id,
    projectName: null,
    sectionId: null,
    sectionName: null,
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

type TaskDetailHashContext = {
  hashIndex: number;
  rawAfterHash: string;
};

type ExistingProjectSectionMatch = {
  projectName: string;
  sectionName: string | null;
  sanitizedInput: string;
};

const PROJECT_PLACEHOLDER = '__taskdetailproject__';
const SECTION_PLACEHOLDER = '__taskdetailsection__';

function resolveTaskDetailParsedResult(payload: SyncPayload, input: string): QuickAddResult {
  const spacedMatch = findExistingProjectSectionMatch(payload, input);
  if (!spacedMatch) {
    return parseQuickAdd(input);
  }

  const reparsed = parseQuickAdd(spacedMatch.sanitizedInput);
  return {
    ...reparsed,
    projectName: spacedMatch.projectName,
    sectionName: spacedMatch.sectionName ?? reparsed.sectionName,
  };
}

function findExistingProjectSectionMatch(payload: SyncPayload, input: string): ExistingProjectSectionMatch | null {
  const hashContext = parseTaskDetailHashContext(input);
  if (!hashContext) return null;

  const activeProjects = getActiveProjects(payload, true)
    .filter(project => !project.deletedAt && !project.archived)
    .sort((left, right) => right.name.length - left.name.length);
  const matchedProject = activeProjects.find(project =>
    hashContext.rawAfterHash.toLowerCase().startsWith(project.name.toLowerCase()) &&
    isProjectBoundary(hashContext.rawAfterHash.charAt(project.name.length) || null),
  );
  if (!matchedProject) return null;

  const projectRemainder = hashContext.rawAfterHash.slice(matchedProject.name.length);
  const matchingSection = projectRemainder.startsWith('/')
    ? getProjectSections(payload, matchedProject.id)
        .filter(section => !section.deletedAt)
        .sort((left, right) => right.name.length - left.name.length)
        .find(section => {
          const sectionSource = projectRemainder.slice(1);
          return (
            sectionSource.toLowerCase().startsWith(section.name.toLowerCase()) &&
            isSectionBoundary(sectionSource.charAt(section.name.length) || null)
          );
        }) ?? null
    : null;

  const projectNeedsRewrite = hasWhitespace(matchedProject.name);
  const sectionNeedsRewrite = matchingSection ? hasWhitespace(matchingSection.name) : false;
  if (!projectNeedsRewrite && !sectionNeedsRewrite) {
    return null;
  }

  const sanitizedAfterHash = (() => {
    let nextValue = PROJECT_PLACEHOLDER;
    if (matchingSection) {
      nextValue += '/';
      if (sectionNeedsRewrite) {
        nextValue += SECTION_PLACEHOLDER + projectRemainder.slice(1 + matchingSection.name.length);
      } else {
        nextValue += projectRemainder.slice(1);
      }
      return nextValue;
    }
    return nextValue + projectRemainder;
  })();

  return {
    projectName: matchedProject.name,
    sectionName: matchingSection?.name ?? null,
    sanitizedInput: input.slice(0, hashContext.hashIndex + 1) + sanitizedAfterHash,
  };
}

function parseTaskDetailHashContext(text: string): TaskDetailHashContext | null {
  const hashIndex = text.lastIndexOf('#');
  if (hashIndex === -1) return null;

  return {
    hashIndex,
    rawAfterHash: text.slice(hashIndex + 1),
  };
}

function isProjectBoundary(value: string | null): boolean {
  return value === null || value === '' || value === '/' || /\s/.test(value);
}

function isSectionBoundary(value: string | null): boolean {
  return value === null || value === '' || /\s/.test(value);
}

function hasWhitespace(value: string): boolean {
  return /\s/.test(value);
}
