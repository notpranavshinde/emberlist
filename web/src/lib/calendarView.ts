import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type { Task } from "../types/sync";
import type { WeekStartsOn } from "./webPreferences";

export function calendarDateKey(value: number | Date): string {
  return format(value instanceof Date ? value : new Date(value), "yyyy-MM-dd");
}

export function buildCalendarMonthDays(
  month: number | Date,
  weekStartsOn: WeekStartsOn,
): Date[] {
  const value = month instanceof Date ? month : new Date(month);
  return eachDayOfInterval({
    start: startOfWeek(startOfMonth(value), { weekStartsOn }),
    end: endOfWeek(endOfMonth(value), { weekStartsOn }),
  });
}

export function groupTasksByCalendarDate(tasks: Task[]): {
  dated: Map<string, Task[]>;
  undated: Task[];
} {
  const dated = new Map<string, Task[]>();
  const undated: Task[] = [];

  tasks.forEach((task) => {
    if (task.dueAt === null) {
      undated.push(task);
      return;
    }
    const key = calendarDateKey(task.dueAt);
    const bucket = dated.get(key) ?? [];
    bucket.push(task);
    dated.set(key, bucket);
  });

  return { dated, undated };
}

export function moveTaskDueAtToCalendarDate(
  task: Task,
  targetDate: number | Date | null,
): number | null {
  if (targetDate === null) return null;
  const target = startOfDay(
    targetDate instanceof Date ? targetDate : new Date(targetDate),
  );
  if (task.dueAt === null || task.allDay) return target.getTime();

  const current = new Date(task.dueAt);
  target.setHours(
    current.getHours(),
    current.getMinutes(),
    current.getSeconds(),
    current.getMilliseconds(),
  );
  return target.getTime();
}
