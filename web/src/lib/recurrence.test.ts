import { describe, expect, it } from 'vitest';
import { nextAt, nextDue } from './recurrence';

describe('recurrence', () => {
  it('advances daily recurrences', () => {
    const base = new Date(2026, 1, 6, 0, 0, 0, 0).getTime();
    const expected = new Date(2026, 1, 7, 0, 0, 0, 0).getTime();

    expect(nextDue(base, 'FREQ=DAILY')).toBe(expected);
  });

  it('advances weekday recurrences to the next matching weekday', () => {
    const base = new Date(2026, 1, 6, 0, 0, 0, 0).getTime();
    const expected = new Date(2026, 1, 9, 0, 0, 0, 0).getTime();

    expect(nextDue(base, 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')).toBe(expected);
  });

  it('advances every-other-week recurrences across multiple days correctly', () => {
    const tuesday = new Date(2026, 1, 3, 0, 0, 0, 0).getTime();
    const thursday = new Date(2026, 1, 5, 0, 0, 0, 0).getTime();
    const wrapBase = new Date(2026, 1, 5, 0, 0, 0, 0).getTime();
    const wrapped = new Date(2026, 1, 17, 0, 0, 0, 0).getTime();

    expect(nextDue(tuesday, 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH')).toBe(thursday);
    expect(nextDue(wrapBase, 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH')).toBe(wrapped);
  });

  it('preserves time when requested', () => {
    const base = new Date(2026, 1, 6, 14, 30, 0, 0).getTime();
    const expected = new Date(2026, 1, 7, 14, 30, 0, 0).getTime();

    expect(nextAt(base, 'FREQ=DAILY', true)).toBe(expected);
    expect(nextAt(base, 'FREQ=DAILY', false)).toBe(new Date(2026, 1, 7, 0, 0, 0, 0).getTime());
  });

  it('handles monthly recurrences on days missing from shorter months', () => {
    expect(nextDue(new Date(2026, 0, 31, 0, 0, 0, 0).getTime(), 'FREQ=MONTHLY;BYMONTHDAY=31'))
      .toBe(new Date(2026, 2, 31, 0, 0, 0, 0).getTime());
    expect(nextDue(new Date(2026, 0, 30, 0, 0, 0, 0).getTime(), 'FREQ=MONTHLY;BYMONTHDAY=30'))
      .toBe(new Date(2026, 2, 30, 0, 0, 0, 0).getTime());
    expect(nextDue(new Date(2026, 0, 29, 0, 0, 0, 0).getTime(), 'FREQ=MONTHLY;BYMONTHDAY=29'))
      .toBe(new Date(2026, 2, 29, 0, 0, 0, 0).getTime());
  });

  it('clamps monthly recurrences without BYMONTHDAY to the target month length', () => {
    const base = new Date(2026, 0, 31, 0, 0, 0, 0).getTime();
    const expected = new Date(2026, 1, 28, 0, 0, 0, 0).getTime();

    expect(nextDue(base, 'FREQ=MONTHLY')).toBe(expected);
  });

  it('handles weekly rules with unsorted or duplicate BYDAY values', () => {
    const unsortedBase = new Date(2026, 1, 4, 0, 0, 0, 0).getTime();
    const duplicateBase = new Date(2026, 1, 2, 0, 0, 0, 0).getTime();

    expect(nextDue(unsortedBase, 'FREQ=WEEKLY;BYDAY=FR,MO,WE'))
      .toBe(new Date(2026, 1, 6, 0, 0, 0, 0).getTime());
    expect(nextDue(duplicateBase, 'FREQ=WEEKLY;BYDAY=MO,MO,TU'))
      .toBe(new Date(2026, 1, 3, 0, 0, 0, 0).getTime());
  });

  it('handles yearly recurrence and leap-year clamping', () => {
    expect(nextDue(new Date(2026, 1, 6, 0, 0, 0, 0).getTime(), 'FREQ=YEARLY'))
      .toBe(new Date(2027, 1, 6, 0, 0, 0, 0).getTime());
    expect(nextDue(new Date(2024, 1, 29, 0, 0, 0, 0).getTime(), 'FREQ=YEARLY'))
      .toBe(new Date(2025, 1, 28, 0, 0, 0, 0).getTime());
  });

  it('returns null for invalid or missing frequency rules', () => {
    const base = new Date(2026, 1, 6, 0, 0, 0, 0).getTime();

    expect(nextDue(base, 'FREQ=INVALID')).toBeNull();
    expect(nextDue(base, 'INTERVAL=2')).toBeNull();
    expect(nextDue(base, '')).toBeNull();
  });

  it('treats explicit zero interval as same-date recurrence like Android', () => {
    const base = new Date(2026, 1, 6, 0, 0, 0, 0).getTime();
    expect(nextDue(base, 'FREQ=DAILY;INTERVAL=0')).toBe(base);
  });

  it('supports large intervals without overflow', () => {
    const base = new Date(2026, 1, 6, 0, 0, 0, 0).getTime();
    const expected = new Date(2026, 1, 6 + 999999, 0, 0, 0, 0).getTime();

    expect(nextDue(base, 'FREQ=DAILY;INTERVAL=999999')).toBe(expected);
  });
});
