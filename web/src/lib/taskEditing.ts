import { format } from 'date-fns';
import type { TaskReminderDraft } from './workspace';

export type RecurrencePreset = 'NONE' | 'DAILY' | 'WEEKDAYS' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'CUSTOM';
export type ReminderEditorMode = 'ABSOLUTE' | 'OFFSET';

export type ReminderEditorDraft = {
  id: string;
  mode: ReminderEditorMode;
  absoluteValue: string;
  offsetMinutes: number;
};

export function getRecurrencePreset(rule: string | null): RecurrencePreset {
  if (!rule) return 'NONE';
  if (rule === 'FREQ=DAILY') return 'DAILY';
  if (rule === 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR') return 'WEEKDAYS';
  if (rule === 'FREQ=WEEKLY') return 'WEEKLY';
  if (rule === 'FREQ=MONTHLY') return 'MONTHLY';
  if (rule === 'FREQ=YEARLY') return 'YEARLY';
  return 'CUSTOM';
}

export function getRuleForRecurrencePreset(preset: Exclude<RecurrencePreset, 'NONE' | 'CUSTOM'>): string {
  switch (preset) {
    case 'DAILY':
      return 'FREQ=DAILY';
    case 'WEEKDAYS':
      return 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
    case 'WEEKLY':
      return 'FREQ=WEEKLY';
    case 'MONTHLY':
      return 'FREQ=MONTHLY';
    case 'YEARLY':
      return 'FREQ=YEARLY';
  }
}

export function createReminderEditor(dueAt: number | null, now: number = Date.now()): ReminderEditorDraft {
  if (dueAt !== null) {
    return {
      id: crypto.randomUUID(),
      mode: 'OFFSET',
      absoluteValue: '',
      offsetMinutes: 30,
    };
  }

  return {
    id: crypto.randomUUID(),
    mode: 'ABSOLUTE',
    absoluteValue: format(now + 60 * 60 * 1000, "yyyy-MM-dd'T'HH:mm"),
    offsetMinutes: 30,
  };
}

export function buildReminderEditors(reminders: TaskReminderDraft[]): ReminderEditorDraft[] {
  return reminders.map(reminder =>
    reminder.kind === 'ABSOLUTE'
      ? {
        id: crypto.randomUUID(),
        mode: 'ABSOLUTE',
        absoluteValue: format(reminder.timeAt, "yyyy-MM-dd'T'HH:mm"),
        offsetMinutes: 30,
      }
      : {
        id: crypto.randomUUID(),
        mode: 'OFFSET',
        absoluteValue: '',
        offsetMinutes: reminder.offsetMinutes,
      }
  );
}

export function hasIncompleteReminderEditors(editors: ReminderEditorDraft[]): boolean {
  return editors.some(editor =>
    editor.mode === 'ABSOLUTE'
      ? !editor.absoluteValue
      : !Number.isFinite(editor.offsetMinutes) || editor.offsetMinutes <= 0
  );
}

export function serializeReminderEditors(editors: ReminderEditorDraft[]): TaskReminderDraft[] {
  return editors.flatMap<TaskReminderDraft>(editor => {
    if (editor.mode === 'ABSOLUTE') {
      const timeAt = new Date(editor.absoluteValue).getTime();
      if (!editor.absoluteValue || Number.isNaN(timeAt)) {
        return [];
      }
      return [{ kind: 'ABSOLUTE' as const, timeAt }];
    }

    const offsetMinutes = Math.max(1, Math.round(editor.offsetMinutes));
    if (!Number.isFinite(offsetMinutes)) {
      return [];
    }
    return [{ kind: 'OFFSET' as const, offsetMinutes }];
  });
}
