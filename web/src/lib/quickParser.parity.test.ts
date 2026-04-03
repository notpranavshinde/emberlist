import { describe, expect, it } from 'vitest';
import { parseQuickAdd } from './quickParser';

const NOW = new Date(2026, 1, 6, 9, 0, 0, 0);

describe('quickParser parity', () => {
  it('parses due date, priority, and project', () => {
    const parsed = parseQuickAdd('Pay rent tomorrow 8am p1 #Home', NOW);

    expect(parsed.title).toBe('Pay rent');
    expect(parsed.dueAt).not.toBeNull();
    expect(parsed.priority).toBe('P1');
    expect(parsed.projectName).toBe('Home');
  });

  it('defaults bare times to today and strips time tokens from the title', () => {
    expect(parseQuickAdd('Pay rent at 9:50pm', NOW)).toMatchObject({
      title: 'Pay rent',
      dueAt: new Date(2026, 1, 6, 21, 50, 0, 0).getTime(),
      allDay: false,
    });
    expect(parseQuickAdd('Workout 7:15pm', NOW)).toMatchObject({
      title: 'Workout',
      dueAt: new Date(2026, 1, 6, 19, 15, 0, 0).getTime(),
      allDay: false,
    });
  });

  it('keeps bare past times on the same day instead of rolling them forward', () => {
    const parsed = parseQuickAdd('Laundry at 9:50pm', new Date(2026, 1, 6, 23, 0, 0, 0));
    expect(parsed.dueAt).toBe(new Date(2026, 1, 6, 21, 50, 0, 0).getTime());
  });

  it('supports explicit date formats and weekday parsing', () => {
    expect(parseQuickAdd('Doctor aug 14 9:50pm', NOW).dueAt)
      .toBe(new Date(2026, 7, 14, 21, 50, 0, 0).getTime());
    expect(parseQuickAdd('Task 2026-03-15', NOW).dueAt).not.toBeNull();
    expect(parseQuickAdd('Task 3/15/27', NOW).dueAt).not.toBeNull();
    expect(parseQuickAdd('Task March 15', NOW).dueAt).not.toBeNull();
    expect(parseQuickAdd('Task Friday', NOW).dueAt).not.toBeNull();
    expect(parseQuickAdd('Task Monday', new Date(2026, 1, 7, 9, 0, 0, 0)).dueAt).not.toBeNull();
  });

  it('parses deadline phrases and reminder phrases', () => {
    const parsed = parseQuickAdd(
      'Review report tomorrow 9am p1 #Work/Reports deadline Friday 5pm remind me 30m before',
      NOW,
    );

    expect(parsed.title).toBe('Review report');
    expect(parsed.priority).toBe('P1');
    expect(parsed.projectName).toBe('Work');
    expect(parsed.sectionName).toBe('Reports');
    expect(parsed.dueAt).not.toBeNull();
    expect(parsed.deadlineAt).not.toBeNull();
    expect(parsed.reminders).toEqual([{ kind: 'OFFSET', minutes: 30 }]);
  });

  it('parses recurrence variants and preserves time when present', () => {
    expect(parseQuickAdd('Task every day', NOW).recurrenceRule).toBe('FREQ=DAILY');
    expect(parseQuickAdd('Task every weekday', NOW).recurrenceRule).toBe('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
    expect(parseQuickAdd('Task every week', NOW).recurrenceRule).toBe('FREQ=WEEKLY');
    expect(parseQuickAdd('Task every month', NOW).recurrenceRule).toBe('FREQ=MONTHLY');
    expect(parseQuickAdd('Task every year', NOW).recurrenceRule).toBe('FREQ=YEARLY');
    expect(parseQuickAdd('Task every 3 days', NOW).recurrenceRule).toBe('FREQ=DAILY;INTERVAL=3');
    expect(parseQuickAdd('Task every other week', NOW).recurrenceRule).toBe('FREQ=WEEKLY;INTERVAL=2');
    expect(parseQuickAdd('Task every month on the 15th', NOW).recurrenceRule).toBe('FREQ=MONTHLY;BYMONTHDAY=15');
    expect(parseQuickAdd('Task 15th of every month', NOW).recurrenceRule).toBe('FREQ=MONTHLY;BYMONTHDAY=15');
    expect(parseQuickAdd('Laundry every other monday', NOW).recurrenceRule).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO');

    const timedRecurring = parseQuickAdd('Standup every day 9am', NOW);
    expect(timedRecurring.recurrenceRule).toBe('FREQ=DAILY');
    expect(timedRecurring.dueAt).toBe(new Date(2026, 1, 6, 9, 0, 0, 0).getTime());
  });

  it('supports reminder offsets in minutes and hours but not without a due date', () => {
    expect(parseQuickAdd('Task tomorrow 9am remind me 30m before', NOW).reminders).toEqual([
      { kind: 'OFFSET', minutes: 30 },
    ]);
    expect(parseQuickAdd('Task tomorrow 9am remind me 2h before', NOW).reminders).toEqual([
      { kind: 'OFFSET', minutes: 120 },
    ]);
    expect(parseQuickAdd('Task remind me 30m before', NOW).reminders).toEqual([]);
  });

  it('uses Untitled task for blank input and defaults priority to P4', () => {
    expect(parseQuickAdd('', NOW).title).toBe('Untitled task');
    expect(parseQuickAdd('   \t\n  ', NOW).title).toBe('Untitled task');
    expect(parseQuickAdd('Task with no priority', NOW).priority).toBe('P4');
  });

  it('keeps last hash token as the project token and supports spaced names at the end', () => {
    expect(parseQuickAdd('Task #Work #Home', NOW).projectName).toBe('Home');
    expect(parseQuickAdd('Prepare outline tomorrow #Client Work/Deep Focus', NOW)).toMatchObject({
      title: 'Prepare outline',
      projectName: 'Client Work',
      sectionName: 'Deep Focus',
    });
  });

  it('treats hash fragments as project tokens with current parser behavior', () => {
    expect(parseQuickAdd('What is #awesome', NOW)).toMatchObject({
      title: 'What is',
      projectName: 'awesome',
    });
    expect(parseQuickAdd('Call #555-1234 tomorrow', NOW)).toMatchObject({
      title: 'Call',
      projectName: '555-1234',
    });
  });

  it('keeps the first matching priority token like Android currently does', () => {
    expect(parseQuickAdd('Task p1 p2 p3', NOW).priority).toBe('P1');
  });

  it('supports weekend and in-N-days phrases', () => {
    expect(parseQuickAdd('Task this weekend', NOW).dueAt).not.toBeNull();
    expect(parseQuickAdd('Task next weekend', NOW).dueAt).not.toBeNull();
    expect(parseQuickAdd('Task in 5 days', NOW).dueAt).not.toBeNull();
    expect(parseQuickAdd('Task in 3 days 2pm', NOW).dueAt).not.toBeNull();
  });
});
