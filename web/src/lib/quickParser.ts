import type { Priority } from '../types/sync';

export const DEFAULT_TIME_HOUR = 9;

export type ReminderSpec =
  | { kind: 'ABSOLUTE'; timeAt: number }
  | { kind: 'OFFSET'; minutes: number };

export type QuickAddResult = {
  title: string;
  dueAt: number | null;
  deadlineAt: number | null;
  allDay: boolean;
  deadlineAllDay: boolean;
  priority: Priority;
  projectName: string | null;
  sectionName: string | null;
  recurrenceRule: string | null;
  deadlineRecurringRule: string | null;
  reminders: ReminderSpec[];
};

const TIME_REGEX = /(\d{1,2})(?::(\d{2}))?\s?(am|pm)/i;
const EXPLICIT_DATE_REGEX = /(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/;
const MONTH_NAME_REGEX =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/i;
const DAY_MONTH_NAME_REGEX =
  /\b(\d{1,2})(st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:,?\s+(\d{4}))?\b/i;
const WEEKDAY_TOKEN_REGEX =
  /\b(mon(day)?|tue(sday)?|wed(nesday)?|thu(rsday)?|fri(day)?|sat(urday)?|sun(day)?)\b/i;

type LocalDate = { year: number; month: number; day: number };
type LocalTime = { hour: number; minute: number };

export function parseQuickAdd(input: string, now: Date = new Date()): QuickAddResult {
  const tokens = input.trim();
  const priority = parsePriority(tokens) ?? 'P4';
  const [projectName, sectionName] = parseProjectSection(tokens);
  const explicitTime = parseTime(tokens);
  let dueAt = parseDue(tokens, now);
  const deadlinePhrase = extractDeadlinePhrase(tokens);
  const deadlineTime = deadlinePhrase ? parseTime(deadlinePhrase) : null;
  let deadlineAt = deadlinePhrase ? parseDeadline(deadlinePhrase, now) : null;
  const recurrenceRule = parseRecurrence(tokens);
  const deadlineRecurringRule = deadlinePhrase ? parseRecurrence(deadlinePhrase) : null;
  let allDay = false;
  let deadlineAllDay = false;

  if (dueAt === null && explicitTime !== null) {
    dueAt = toEpochMillis(localDateFromDate(now), explicitTime);
    allDay = false;
  }

  if (dueAt === null && recurrenceRule !== null) {
    const time = explicitTime ?? { hour: 0, minute: 0 };
    allDay = explicitTime === null;
    const baseDate = nextOccurrenceDate(recurrenceRule, localDateFromDate(now)) ?? localDateFromDate(now);
    dueAt = toEpochMillis(baseDate, time);
  } else if (dueAt !== null) {
    allDay = explicitTime === null;
  }

  if (deadlineAt === null && deadlineRecurringRule !== null) {
    const time = deadlineTime ?? { hour: 0, minute: 0 };
    deadlineAllDay = deadlineTime === null;
    const baseDate = nextOccurrenceDate(deadlineRecurringRule, localDateFromDate(now)) ?? localDateFromDate(now);
    deadlineAt = toEpochMillis(baseDate, time);
  } else if (deadlineAt !== null) {
    deadlineAllDay = deadlineTime === null;
  }

  const reminders = parseReminders(tokens, now, dueAt);

  return {
    title: stripTokens(tokens) || 'Untitled task',
    dueAt,
    deadlineAt,
    allDay,
    deadlineAllDay,
    priority,
    projectName,
    sectionName,
    recurrenceRule,
    deadlineRecurringRule,
    reminders,
  };
}

function parsePriority(input: string): Priority | null {
  if (/\bp1\b/i.test(input)) return 'P1';
  if (/\bp2\b/i.test(input)) return 'P2';
  if (/\bp3\b/i.test(input)) return 'P3';
  if (/\bp4\b/i.test(input)) return 'P4';
  return null;
}

function parseProjectSection(input: string): [string | null, string | null] {
  const hashIndex = input.lastIndexOf('#');
  if (hashIndex === -1) return [null, null];
  const token = input.slice(hashIndex + 1).trim();
  if (!token) return [null, null];
  const [projectName = '', sectionName = ''] = token.split('/', 2);
  return [projectName.trim() || null, sectionName.trim() || null];
}

function parseDue(input: string, now: Date): number | null {
  const lower = input.toLowerCase();
  const time = parseTime(input) ?? { hour: 0, minute: 0 };
  let date: LocalDate | null = null;

  if (lower.includes('today')) {
    date = localDateFromDate(now);
  } else if (lower.includes('tomorrow')) {
    date = addDaysToLocalDate(localDateFromDate(now), 1);
  } else if (lower.includes('next week')) {
    date = addDaysToLocalDate(localDateFromDate(now), 7);
  } else if (lower.includes('this weekend')) {
    date = nextOrSameWeekday(localDateFromDate(now), 6);
  } else if (lower.includes('next weekend')) {
    date = nextWeekday(localDateFromDate(now), 6);
  } else {
    const inDays = /in\s+(\d+)\s+days/i.exec(input);
    if (inDays) {
      date = addDaysToLocalDate(localDateFromDate(now), Number.parseInt(inDays[1], 10));
    } else if (MONTH_NAME_REGEX.test(input) || DAY_MONTH_NAME_REGEX.test(input)) {
      date = parseMonthNameDate(input, localDateFromDate(now));
    } else if (EXPLICIT_DATE_REGEX.test(input)) {
      date = parseExplicitDate(input, localDateFromDate(now));
    } else if (WEEKDAY_TOKEN_REGEX.test(input)) {
      date = parseWeekday(input, localDateFromDate(now));
    }
  }

  if (!date) return null;
  const epochMillis = toEpochMillis(date, time);
  return Number.isNaN(epochMillis) ? null : epochMillis;
}

function parseDeadline(phrase: string, now: Date): number | null {
  const lower = phrase.toLowerCase();
  const time = parseTime(phrase) ?? { hour: 0, minute: 0 };
  let date: LocalDate | null = null;

  if (lower.includes('today')) {
    date = localDateFromDate(now);
  } else if (lower.includes('tomorrow')) {
    date = addDaysToLocalDate(localDateFromDate(now), 1);
  } else if (lower.includes('next week')) {
    date = addDaysToLocalDate(localDateFromDate(now), 7);
  } else {
    const inDays = /in\s+(\d+)\s+days/i.exec(phrase);
    if (inDays) {
      date = addDaysToLocalDate(localDateFromDate(now), Number.parseInt(inDays[1], 10));
    } else if (WEEKDAY_TOKEN_REGEX.test(phrase)) {
      date = parseWeekday(phrase, localDateFromDate(now));
    } else if (MONTH_NAME_REGEX.test(phrase) || DAY_MONTH_NAME_REGEX.test(phrase)) {
      date = parseMonthNameDate(phrase, localDateFromDate(now));
    } else if (EXPLICIT_DATE_REGEX.test(phrase)) {
      date = parseExplicitDate(phrase, localDateFromDate(now));
    }
  }

  if (!date) return null;
  const epochMillis = toEpochMillis(date, time);
  return Number.isNaN(epochMillis) ? null : epochMillis;
}

function parseReminders(input: string, now: Date, dueAt: number | null): ReminderSpec[] {
  const reminders: ReminderSpec[] = [];
  const absoluteMatch = /remind me at\s+([^#]+)/i.exec(input);
  if (absoluteMatch) {
    const phrase = absoluteMatch[1].trim();
    const time = parseTime(phrase);
    let date = localDateFromDate(now);

    if (/today/i.test(phrase)) {
      date = localDateFromDate(now);
    } else if (/tomorrow/i.test(phrase)) {
      date = addDaysToLocalDate(localDateFromDate(now), 1);
    } else if (EXPLICIT_DATE_REGEX.test(phrase)) {
      const parsed = parseExplicitDate(phrase, localDateFromDate(now));
      if (parsed) date = parsed;
    }

    if (time) {
      const epochMillis = toEpochMillis(date, time);
      if (!Number.isNaN(epochMillis)) {
        reminders.push({ kind: 'ABSOLUTE', timeAt: epochMillis });
      }
    }
  }

  const relativeMatch = /remind me\s+(\d+)(m|h)\s+before/i.exec(input);
  if (relativeMatch && dueAt !== null) {
    const amount = Number.parseInt(relativeMatch[1], 10);
    const minutes = relativeMatch[2].toLowerCase() === 'h' ? amount * 60 : amount;
    reminders.push({ kind: 'OFFSET', minutes });
  }

  return reminders;
}

function parseRecurrence(input: string): string | null {
  if (/every\s+weekday/i.test(input)) return 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
  if (/every\s*day|everyday/i.test(input)) return 'FREQ=DAILY';

  const monthlyOn = /every\s+month\s+on\s+the\s+(\d+)(st|nd|rd|th)?/i.exec(input);
  if (monthlyOn) return `FREQ=MONTHLY;BYMONTHDAY=${Number.parseInt(monthlyOn[1], 10)}`;

  const monthlyEveryNth = /every\s+(\d+)(st|nd|rd|th)\b/i.exec(input);
  if (monthlyEveryNth) return `FREQ=MONTHLY;BYMONTHDAY=${Number.parseInt(monthlyEveryNth[1], 10)}`;

  const monthlyOrdinal = /(\d+)(st|nd|rd|th)?\s+of\s+every\s+month/i.exec(input);
  if (monthlyOrdinal) return `FREQ=MONTHLY;BYMONTHDAY=${Number.parseInt(monthlyOrdinal[1], 10)}`;

  const everyOtherNamedDay = /every\s+other\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|\bmon\b|\btue\b|\bwed\b|\bthu\b|\bfri\b|\bsat\b|\bsun\b)/i.exec(input);
  if (everyOtherNamedDay) {
    return `FREQ=WEEKLY;INTERVAL=2;BYDAY=${dayNameToByDay(everyOtherNamedDay[1])}`;
  }

  const everyNamedDay = /every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|\bmon\b|\btue\b|\bwed\b|\bthu\b|\bfri\b|\bsat\b|\bsun\b)/i.exec(input);
  if (everyNamedDay) {
    return `FREQ=WEEKLY;BYDAY=${dayNameToByDay(everyNamedDay[1])}`;
  }

  const everyOther = /every\s+other\s+(day|week|month|year)s?/i.exec(input);
  if (everyOther) {
    return `FREQ=${unitToFrequency(everyOther[1])};INTERVAL=2`;
  }

  const everyInterval = /every\s+(\d+)\s+(day|week|month|year)s?/i.exec(input);
  if (everyInterval) {
    return `FREQ=${unitToFrequency(everyInterval[2])};INTERVAL=${Number.parseInt(everyInterval[1], 10)}`;
  }

  const everyBareUnit = /every\s+(week|month|year)\b/i.exec(input);
  if (everyBareUnit) {
    return `FREQ=${unitToFrequency(everyBareUnit[1])}`;
  }

  return null;
}

function nextOccurrenceDate(rule: string, base: LocalDate): LocalDate | null {
  const freq = /FREQ=([A-Z]+)/.exec(rule)?.[1];
  const interval = Number.parseInt(/INTERVAL=(\d+)/.exec(rule)?.[1] ?? '1', 10);
  if (!freq) return null;

  switch (freq) {
    case 'DAILY':
      return base;
    case 'WEEKLY': {
      const byDayToken = /BYDAY=([A-Z,]+)/.exec(rule)?.[1];
      const days = byDayToken
        ?.split(',')
        .map(tokenToWeekday)
        .filter((value): value is number => value !== null)
        .sort((left, right) => left - right) ?? [];
      const baseWeekday = getWeekday(base);
      const candidateDay = days.find(day => day >= baseWeekday) ?? days[0] ?? baseWeekday;
      const candidate = candidateDay >= baseWeekday
        ? nextOrSameWeekday(base, candidateDay)
        : nextWeekday(base, candidateDay);
      return interval <= 1 ? candidate : addDaysToLocalDate(candidate, (interval - 1) * 7);
    }
    case 'MONTHLY': {
      const byMonthDay = Number.parseInt(/BYMONTHDAY=(\d+)/.exec(rule)?.[1] ?? '', 10);
      if (Number.isNaN(byMonthDay)) return base;
      return base.day <= byMonthDay
        ? clampDay(base, byMonthDay)
        : clampDay(addMonths(base, interval), byMonthDay);
    }
    case 'YEARLY':
      return base;
    default:
      return base;
  }
}

function parseTime(input: string): LocalTime | null {
  const match = TIME_REGEX.exec(input);
  if (!match) return null;
  const hourRaw = Number.parseInt(match[1], 10);
  const minuteRaw = Number.parseInt(match[2] || '0', 10);
  const ampm = match[3].toLowerCase();
  if (!Number.isInteger(hourRaw) || !Number.isInteger(minuteRaw)) return null;
  if (hourRaw < 1 || hourRaw > 12) return null;
  if (minuteRaw < 0 || minuteRaw > 59) return null;
  const hour = ampm === 'am' && hourRaw === 12
    ? 0
    : ampm === 'pm' && hourRaw < 12
      ? hourRaw + 12
      : hourRaw;
  return { hour, minute: minuteRaw };
}

function parseWeekday(input: string, base: LocalDate): LocalDate {
  const token = WEEKDAY_TOKEN_REGEX.exec(input)?.[1]?.toLowerCase() ?? 'monday';
  const target = token.startsWith('mon')
    ? 1
    : token.startsWith('tue')
      ? 2
      : token.startsWith('wed')
        ? 3
        : token.startsWith('thu')
          ? 4
          : token.startsWith('fri')
            ? 5
            : token.startsWith('sat')
              ? 6
              : 0;
  return nextOrSameWeekday(base, target);
}

function parseExplicitDate(input: string, base: LocalDate): LocalDate | null {
  const match = EXPLICIT_DATE_REGEX.exec(input);
  if (!match) return null;
  if (match[1]) {
    const date = {
      year: Number.parseInt(match[1], 10),
      month: Number.parseInt(match[2], 10),
      day: Number.parseInt(match[3], 10),
    };
    return isValidLocalDate(date) ? date : null;
  }

  const yearRaw = match[6] ? Number.parseInt(match[6], 10) : base.year;
  const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
  const date = { year, month: Number.parseInt(match[4], 10), day: Number.parseInt(match[5], 10) };
  return isValidLocalDate(date) ? date : null;
}

function parseMonthNameDate(input: string, base: LocalDate): LocalDate | null {
  const monthFirst = MONTH_NAME_REGEX.exec(input);
  const dayFirst = DAY_MONTH_NAME_REGEX.exec(input);
  let monthToken = '';
  let dayToken = '';
  let yearToken = '';

  if (monthFirst) {
    monthToken = monthFirst[1];
    dayToken = monthFirst[2];
    yearToken = monthFirst[4] ?? '';
  } else if (dayFirst) {
    monthToken = dayFirst[3];
    dayToken = dayFirst[1];
    yearToken = dayFirst[4] ?? '';
  } else {
    return null;
  }

  const month = monthNameToNumber(monthToken);
  const day = Number.parseInt(dayToken, 10);
  const year = yearToken ? Number.parseInt(yearToken, 10) : base.year;
  if (!month || Number.isNaN(day)) return null;
  const date = { year, month, day };
  if (!isValidLocalDate(date)) return null;
  return yearToken ? date : compareLocalDate(date, base) < 0 ? { year: year + 1, month, day } : date;
}

function monthNameToNumber(token: string): number | null {
  const month = token.toLowerCase();
  if (month.startsWith('jan')) return 1;
  if (month.startsWith('feb')) return 2;
  if (month.startsWith('mar')) return 3;
  if (month.startsWith('apr')) return 4;
  if (month === 'may') return 5;
  if (month.startsWith('jun')) return 6;
  if (month.startsWith('jul')) return 7;
  if (month.startsWith('aug')) return 8;
  if (month.startsWith('sep')) return 9;
  if (month.startsWith('oct')) return 10;
  if (month.startsWith('nov')) return 11;
  if (month.startsWith('dec')) return 12;
  return null;
}

function stripTokens(input: string): string {
  return input
    .replace(/#.+$/g, '')
    .replace(/\bp[1-4]\b/gi, '')
    .replace(/today|tomorrow|next week|this weekend|next weekend|in\s+\d+\s+days/gi, '')
    .replace(/deadline\s+[^#]+/gi, '')
    .replace(/by\s+[^#]+/gi, '')
    .replace(/\{deadline:[^}]+\}/gi, '')
    .replace(/remind me[^#]+/gi, '')
    .replace(/every\s+[^#]+/gi, '')
    .replace(/everyday/gi, '')
    .replace(/every\s+day/gi, '')
    .replace(/\d+(st|nd|rd|th)?\s+of\s+every\s+month/gi, '')
    .replace(/\bat\s+\d{1,2}(:\d{2})?\s?(am|pm)\b/gi, '')
    .replace(/\d{4}-\d{1,2}-\d{1,2}/g, '')
    .replace(/\d{1,2}\/\d{1,2}(\/\d{2,4})?/g, '')
    .replace(MONTH_NAME_REGEX, '')
    .replace(DAY_MONTH_NAME_REGEX, '')
    .replace(/\d{1,2}(:\d{2})?\s?(am|pm)/gi, '')
    .trim();
}

function extractDeadlinePhrase(input: string): string | null {
  return /(?:deadline|by)\s+([^#]+)/i.exec(input)?.[1]?.trim()
    ?? /\{deadline:\s*([^}]+)\}/i.exec(input)?.[1]?.trim()
    ?? null;
}

function localDateFromDate(value: Date): LocalDate {
  return {
    year: value.getFullYear(),
    month: value.getMonth() + 1,
    day: value.getDate(),
  };
}

function toEpochMillis(date: LocalDate, time: LocalTime): number {
  if (!isValidLocalDate(date) || !isValidLocalTime(time)) {
    return Number.NaN;
  }
  return new Date(date.year, date.month - 1, date.day, time.hour, time.minute, 0, 0).getTime();
}

function addDaysToLocalDate(date: LocalDate, days: number): LocalDate {
  const next = new Date(date.year, date.month - 1, date.day + days);
  return localDateFromDate(next);
}

function addMonths(date: LocalDate, months: number): LocalDate {
  const next = new Date(date.year, date.month - 1 + months, 1);
  return { year: next.getFullYear(), month: next.getMonth() + 1, day: date.day };
}

function clampDay(base: LocalDate, day: number): LocalDate {
  const maxDay = new Date(base.year, base.month, 0).getDate();
  return { ...base, day: Math.min(day, maxDay) };
}

function getWeekday(date: LocalDate): number {
  return new Date(date.year, date.month - 1, date.day).getDay();
}

function nextOrSameWeekday(base: LocalDate, weekday: number): LocalDate {
  const current = getWeekday(base);
  const delta = (weekday - current + 7) % 7;
  return addDaysToLocalDate(base, delta);
}

function nextWeekday(base: LocalDate, weekday: number): LocalDate {
  const current = getWeekday(base);
  const delta = ((weekday - current + 7) % 7) || 7;
  return addDaysToLocalDate(base, delta);
}

function dayNameToByDay(dayName: string): string {
  const token = dayName.toUpperCase();
  if (token.startsWith('MON')) return 'MO';
  if (token.startsWith('TUE')) return 'TU';
  if (token.startsWith('WED')) return 'WE';
  if (token.startsWith('THU')) return 'TH';
  if (token.startsWith('FRI')) return 'FR';
  if (token.startsWith('SAT')) return 'SA';
  if (token.startsWith('SUN')) return 'SU';
  return 'MO';
}

function tokenToWeekday(token: string): number | null {
  switch (token.toUpperCase()) {
    case 'SU':
      return 0;
    case 'MO':
      return 1;
    case 'TU':
      return 2;
    case 'WE':
      return 3;
    case 'TH':
      return 4;
    case 'FR':
      return 5;
    case 'SA':
      return 6;
    default:
      return null;
  }
}

function unitToFrequency(unit: string): string {
  switch (unit.toLowerCase()) {
    case 'day':
      return 'DAILY';
    case 'week':
      return 'WEEKLY';
    case 'month':
      return 'MONTHLY';
    case 'year':
      return 'YEARLY';
    default:
      return 'DAILY';
  }
}

function compareLocalDate(left: LocalDate, right: LocalDate): number {
  if (left.year !== right.year) return left.year - right.year;
  if (left.month !== right.month) return left.month - right.month;
  return left.day - right.day;
}

function isValidLocalDate(date: LocalDate): boolean {
  if (!Number.isInteger(date.year) || !Number.isInteger(date.month) || !Number.isInteger(date.day)) {
    return false;
  }
  if (date.month < 1 || date.month > 12) return false;
  if (date.day < 1) return false;
  const candidate = new Date(date.year, date.month - 1, date.day);
  return candidate.getFullYear() === date.year
    && candidate.getMonth() === date.month - 1
    && candidate.getDate() === date.day;
}

function isValidLocalTime(time: LocalTime): boolean {
  return Number.isInteger(time.hour)
    && Number.isInteger(time.minute)
    && time.hour >= 0
    && time.hour <= 23
    && time.minute >= 0
    && time.minute <= 59;
}
