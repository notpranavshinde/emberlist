import { format } from 'date-fns';
import { describe, expect, it } from 'vitest';
import {
  formatClock,
  formatDateTimeValue,
  resolveWeekInterval,
} from './webPreferences';

describe('webPreferences', () => {
  it('resolves the current week from sunday when requested', () => {
    const reference = new Date('2026-04-01T12:00:00');
    const interval = resolveWeekInterval(reference, 0);

    expect(format(interval.start, 'yyyy-MM-dd')).toBe('2026-03-29');
    expect(format(interval.end, 'yyyy-MM-dd')).toBe('2026-04-04');
  });

  it('resolves the current week from monday when requested', () => {
    const reference = new Date('2026-04-01T12:00:00');
    const interval = resolveWeekInterval(reference, 1);

    expect(format(interval.start, 'yyyy-MM-dd')).toBe('2026-03-30');
    expect(format(interval.end, 'yyyy-MM-dd')).toBe('2026-04-05');
  });

  it('formats times according to the 24-hour preference', () => {
    const timestamp = new Date('2026-04-01T17:05:00').getTime();

    expect(formatClock(timestamp, false)).toBe('5:05 PM');
    expect(formatClock(timestamp, true)).toBe('17:05');
    expect(formatDateTimeValue(timestamp, true)).toBe('Apr 1, 17:05');
  });
});
