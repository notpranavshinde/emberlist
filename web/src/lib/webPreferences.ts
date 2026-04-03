import { endOfWeek, format, startOfWeek } from 'date-fns';

export type WeekStartsOn = 0 | 1;

export type WebDisplayPreferences = {
  weekStartsOn: WeekStartsOn;
  use24HourTime: boolean;
};

const DEFAULT_PREFERENCES: WebDisplayPreferences = {
  weekStartsOn: 0,
  use24HourTime: false,
};

let currentPreferences: WebDisplayPreferences = DEFAULT_PREFERENCES;

export function getDefaultWebDisplayPreferences(): WebDisplayPreferences {
  return DEFAULT_PREFERENCES;
}

export function setGlobalWebDisplayPreferences(preferences: WebDisplayPreferences) {
  currentPreferences = preferences;
}

export function getGlobalWebDisplayPreferences(): WebDisplayPreferences {
  return currentPreferences;
}

export function resolveWeekInterval(now: number | Date, weekStartsOn: WeekStartsOn = currentPreferences.weekStartsOn) {
  const date = now instanceof Date ? now : new Date(now);
  return {
    start: startOfWeek(date, { weekStartsOn }).getTime(),
    end: endOfWeek(date, { weekStartsOn }).getTime(),
  };
}

export function formatClock(timestamp: number, use24HourTime: boolean = currentPreferences.use24HourTime): string {
  return format(timestamp, use24HourTime ? 'HH:mm' : 'h:mm a');
}

export function formatDateTimeValue(timestamp: number, use24HourTime: boolean = currentPreferences.use24HourTime): string {
  return format(timestamp, use24HourTime ? 'MMM d, HH:mm' : 'MMM d, h:mm a');
}
