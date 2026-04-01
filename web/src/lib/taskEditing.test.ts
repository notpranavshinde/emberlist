import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  buildReminderEditors,
  createReminderEditor,
  getRecurrencePreset,
  getRuleForRecurrencePreset,
  hasIncompleteReminderEditors,
  serializeReminderEditors,
} from './taskEditing';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('taskEditing', () => {
  it('maps known recurrence rules to presets and back', () => {
    expect(getRecurrencePreset(null)).toBe('NONE');
    expect(getRecurrencePreset('FREQ=DAILY')).toBe('DAILY');
    expect(getRecurrencePreset('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')).toBe('WEEKDAYS');
    expect(getRecurrencePreset('FREQ=WEEKLY')).toBe('WEEKLY');
    expect(getRecurrencePreset('FREQ=MONTHLY')).toBe('MONTHLY');
    expect(getRecurrencePreset('FREQ=YEARLY')).toBe('YEARLY');
    expect(getRecurrencePreset('FREQ=WEEKLY;INTERVAL=2;BYDAY=TU')).toBe('CUSTOM');

    expect(getRuleForRecurrencePreset('DAILY')).toBe('FREQ=DAILY');
    expect(getRuleForRecurrencePreset('WEEKDAYS')).toBe('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
  });

  it('round-trips reminder editors to reminder drafts', () => {
    const editors = buildReminderEditors([
      { kind: 'OFFSET', offsetMinutes: 45 },
      { kind: 'ABSOLUTE', timeAt: new Date('2026-04-01T13:30:00').getTime() },
    ]);

    expect(serializeReminderEditors(editors)).toEqual([
      { kind: 'OFFSET', offsetMinutes: 45 },
      { kind: 'ABSOLUTE', timeAt: new Date('2026-04-01T13:30:00').getTime() },
    ]);
  });

  it('creates sensible default reminder editors and flags incomplete rows', () => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-04-01T09:00:00').getTime());

    const offsetEditor = createReminderEditor(new Date('2026-04-02T00:00:00').getTime());
    const absoluteEditor = createReminderEditor(null);

    expect(offsetEditor.mode).toBe('OFFSET');
    expect(offsetEditor.offsetMinutes).toBe(30);
    expect(absoluteEditor.mode).toBe('ABSOLUTE');
    expect(absoluteEditor.absoluteValue).toBe('2026-04-01T10:00');
    expect(hasIncompleteReminderEditors([{ ...absoluteEditor, absoluteValue: '' }])).toBe(true);
    expect(hasIncompleteReminderEditors([offsetEditor, absoluteEditor])).toBe(false);
  });
});
