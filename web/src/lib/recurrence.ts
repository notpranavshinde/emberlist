type LocalDateParts = {
  year: number;
  month: number;
  day: number;
};

type LocalTimeParts = {
  hour: number;
  minute: number;
};

type ParsedRecurrenceRule = {
  freq: string;
  interval: number;
  byDay: number[];
  byMonthDay: number | null;
};

export function nextDue(currentDueAt: number, rule: string): number | null {
  return nextAt(currentDueAt, rule, false);
}

export function nextAt(currentAt: number, rule: string, keepTime: boolean = true): number | null {
  const parts = parseRecurrenceRule(rule);
  if (!parts) return null;

  const current = new Date(currentAt);
  const currentDate = toLocalDateParts(current);
  const currentTime = toLocalTimeParts(current);

  let nextDate: LocalDateParts | null = null;

  switch (parts.freq) {
    case 'DAILY':
      nextDate = addDays(currentDate, parts.interval);
      break;
    case 'WEEKLY':
      if (parts.byDay.length) {
        const uniqueDays = Array.from(new Set(parts.byDay)).sort((left, right) => left - right);
        const currentDay = getIsoWeekday(currentDate);
        const laterDay = uniqueDays.find(day => day > currentDay);
        if (laterDay !== undefined) {
          nextDate = nextWeekday(currentDate, laterDay);
        } else {
          const firstDay = uniqueDays[0];
          const baseNext = nextWeekday(currentDate, firstDay);
          nextDate = parts.interval > 1 ? addDays(baseNext, (parts.interval - 1) * 7) : baseNext;
        }
      } else {
        nextDate = addDays(currentDate, parts.interval * 7);
      }
      break;
    case 'MONTHLY':
      nextDate = parts.byMonthDay !== null
        ? findMonthWithDay(currentDate, parts.interval, parts.byMonthDay)
        : addMonths(currentDate, parts.interval);
      break;
    case 'YEARLY':
      nextDate = addYears(currentDate, parts.interval);
      break;
    default:
      return null;
  }

  if (!nextDate) return null;
  return toEpochMillis(nextDate, keepTime ? currentTime : { hour: 0, minute: 0 });
}

function parseRecurrenceRule(rule: string): ParsedRecurrenceRule | null {
  if (!rule) return null;
  const parts = new Map(
    rule.split(';').map(part => {
      const [key, value = ''] = part.split('=');
      return [key.toUpperCase(), value];
    }),
  );
  const freq = parts.get('FREQ');
  if (!freq) return null;

  const parsedInterval = Number.parseInt(parts.get('INTERVAL') ?? '1', 10);
  const interval = Number.isNaN(parsedInterval) ? 1 : parsedInterval;
  const parsedMonthDay = Number.parseInt(parts.get('BYMONTHDAY') ?? '', 10);

  return {
    freq,
    interval,
    byDay: (parts.get('BYDAY') ?? '')
      .split(',')
      .map(tokenToIsoWeekday)
      .filter((value): value is number => value !== null),
    byMonthDay: Number.isNaN(parsedMonthDay) ? null : parsedMonthDay,
  };
}

function tokenToIsoWeekday(token: string): number | null {
  switch (token.toUpperCase()) {
    case 'MO': return 1;
    case 'TU': return 2;
    case 'WE': return 3;
    case 'TH': return 4;
    case 'FR': return 5;
    case 'SA': return 6;
    case 'SU': return 7;
    default: return null;
  }
}

function toLocalDateParts(value: Date): LocalDateParts {
  return {
    year: value.getFullYear(),
    month: value.getMonth() + 1,
    day: value.getDate(),
  };
}

function toLocalTimeParts(value: Date): LocalTimeParts {
  return {
    hour: value.getHours(),
    minute: value.getMinutes(),
  };
}

function toEpochMillis(date: LocalDateParts, time: LocalTimeParts): number {
  return new Date(date.year, date.month - 1, date.day, time.hour, time.minute, 0, 0).getTime();
}

function getIsoWeekday(date: LocalDateParts): number {
  const weekday = new Date(date.year, date.month - 1, date.day).getDay();
  return weekday === 0 ? 7 : weekday;
}

function addDays(date: LocalDateParts, days: number): LocalDateParts {
  const next = new Date(date.year, date.month - 1, date.day + days);
  return toLocalDateParts(next);
}

function addMonths(date: LocalDateParts, months: number): LocalDateParts {
  const targetMonthIndex = date.month - 1 + months;
  const monthStart = new Date(date.year, targetMonthIndex, 1);
  const maxDay = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  return {
    year: monthStart.getFullYear(),
    month: monthStart.getMonth() + 1,
    day: Math.min(date.day, maxDay),
  };
}

function addYears(date: LocalDateParts, years: number): LocalDateParts {
  const targetYear = date.year + years;
  const maxDay = new Date(targetYear, date.month, 0).getDate();
  return {
    year: targetYear,
    month: date.month,
    day: Math.min(date.day, maxDay),
  };
}

function nextWeekday(date: LocalDateParts, targetDay: number): LocalDateParts {
  const currentDay = getIsoWeekday(date);
  const delta = targetDay > currentDay ? targetDay - currentDay : 7 - currentDay + targetDay;
  return addDays(date, delta);
}

function findMonthWithDay(base: LocalDateParts, interval: number, targetDay: number): LocalDateParts {
  let candidate = addMonths({ ...base, day: 1 }, interval);
  while (new Date(candidate.year, candidate.month, 0).getDate() < targetDay) {
    candidate = addMonths({ ...candidate, day: 1 }, 1);
  }
  return {
    year: candidate.year,
    month: candidate.month,
    day: targetDay,
  };
}
