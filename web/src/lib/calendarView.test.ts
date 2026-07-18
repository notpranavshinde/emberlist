import { describe, expect, it } from "vitest";
import type { Task } from "../types/sync";
import {
  buildCalendarMonthDays,
  calendarDateKey,
  groupTasksByCalendarDate,
  moveTaskDueAtToCalendarDate,
} from "./calendarView";

function task(id: string, dueAt: number | null, allDay = true): Task {
  return {
    id,
    title: id,
    description: "",
    projectId: null,
    sectionId: null,
    priority: "P4",
    dueAt,
    allDay,
    status: "OPEN",
    completedAt: null,
    parentTaskId: null,
    locationId: null,
    locationTriggerType: null,
    order: 0,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
  };
}

describe("calendar view helpers", () => {
  it("builds complete week rows around a month", () => {
    const days = buildCalendarMonthDays(new Date(2026, 6, 1), 0);
    expect(days).toHaveLength(35);
    expect(calendarDateKey(days[0])).toBe("2026-06-28");
    expect(calendarDateKey(days.at(-1)!)).toBe("2026-08-01");
  });

  it("respects Monday as the first weekday", () => {
    const days = buildCalendarMonthDays(new Date(2026, 6, 1), 1);
    expect(calendarDateKey(days[0])).toBe("2026-06-29");
    expect(days.length % 7).toBe(0);
  });

  it("groups dated tasks and keeps undated tasks in their own lane", () => {
    const dated = task("dated", new Date(2026, 6, 18, 14, 30).getTime(), false);
    const undated = task("undated", null);
    const result = groupTasksByCalendarDate([dated, undated]);
    expect(result.dated.get("2026-07-18")).toEqual([dated]);
    expect(result.undated).toEqual([undated]);
  });

  it("preserves a timed task's clock time when moving dates", () => {
    const timed = task("timed", new Date(2026, 6, 18, 14, 35).getTime(), false);
    const moved = new Date(
      moveTaskDueAtToCalendarDate(timed, new Date(2026, 7, 4))!,
    );
    expect(calendarDateKey(moved)).toBe("2026-08-04");
    expect(moved.getHours()).toBe(14);
    expect(moved.getMinutes()).toBe(35);
  });

  it("moves all-day tasks to local midnight and supports no date", () => {
    const allDay = task("all-day", new Date(2026, 6, 18).getTime());
    const moved = moveTaskDueAtToCalendarDate(allDay, new Date(2026, 7, 4));
    expect(moved).toBe(new Date(2026, 7, 4).setHours(0, 0, 0, 0));
    expect(moveTaskDueAtToCalendarDate(allDay, null)).toBeNull();
  });
});
