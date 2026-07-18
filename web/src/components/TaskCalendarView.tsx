import { useMemo, useState, type DragEvent } from "react";
import {
  addMonths,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  subMonths,
} from "date-fns";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  GripVertical,
  Inbox,
} from "lucide-react";
import {
  buildCalendarMonthDays,
  calendarDateKey,
  groupTasksByCalendarDate,
  moveTaskDueAtToCalendarDate,
} from "../lib/calendarView";
import {
  formatClock,
  getGlobalWebDisplayPreferences,
} from "../lib/webPreferences";
import type { Project, Section, Task } from "../types/sync";

type TaskCalendarViewProps = {
  tasks: Task[];
  projects: Project[];
  sections?: Section[];
  todayStartMs: number;
  onOpenTask: (taskId: string) => void;
  onToggleTask: (taskId: string) => void;
  onRescheduleTasks: (taskIds: string[], dueAt: number | null) => void;
};

export function TaskCalendarView({
  tasks,
  projects,
  sections = [],
  todayStartMs,
  onOpenTask,
  onToggleTask,
  onRescheduleTasks,
}: TaskCalendarViewProps) {
  const [visibleMonth, setVisibleMonth] = useState(() =>
    startOfMonth(new Date(todayStartMs)),
  );
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [activeDropKey, setActiveDropKey] = useState<string | null>(null);
  const weekStartsOn = getGlobalWebDisplayPreferences().weekStartsOn;
  const calendarDays = useMemo(
    () => buildCalendarMonthDays(visibleMonth, weekStartsOn),
    [visibleMonth, weekStartsOn],
  );
  const { dated, undated } = useMemo(
    () => groupTasksByCalendarDate(tasks),
    [tasks],
  );
  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );
  const sectionById = useMemo(
    () => new Map(sections.map((section) => [section.id, section])),
    [sections],
  );
  const weekdayLabels = calendarDays.slice(0, 7).map((day) => format(day, "EEE"));

  function beginDrag(event: DragEvent<HTMLElement>, taskId: string) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/task-id", taskId);
    setDraggedTaskId(taskId);
  }

  function resolveDraggedTask(event: DragEvent<HTMLElement>) {
    const taskId =
      draggedTaskId ?? event.dataTransfer.getData("text/task-id").trim();
    return tasks.find((task) => task.id === taskId) ?? null;
  }

  function allowDrop(event: DragEvent<HTMLElement>, key: string) {
    if (!resolveDraggedTask(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setActiveDropKey(key);
  }

  function dropOnDate(event: DragEvent<HTMLElement>, day: Date) {
    const task = resolveDraggedTask(event);
    setActiveDropKey(null);
    setDraggedTaskId(null);
    if (!task) return;
    event.preventDefault();
    const dueAt = moveTaskDueAtToCalendarDate(task, day);
    if (dueAt === task.dueAt) return;
    onRescheduleTasks([task.id], dueAt);
  }

  function dropWithoutDate(event: DragEvent<HTMLElement>) {
    const task = resolveDraggedTask(event);
    setActiveDropKey(null);
    setDraggedTaskId(null);
    if (!task || task.dueAt === null) return;
    event.preventDefault();
    onRescheduleTasks([task.id], null);
  }

  function taskContext(task: Task) {
    if (task.sectionId) return sectionById.get(task.sectionId)?.name ?? null;
    if (task.projectId) return projectById.get(task.projectId)?.name ?? null;
    return "Inbox";
  }

  return (
    <section
      className="overflow-hidden rounded-[30px] border border-[#DED4CA] bg-[var(--app-surface)] shadow-[0_18px_50px_rgba(83,61,45,0.08)]"
      data-calendar-view="true"
    >
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E8DED5] px-5 py-4 sm:px-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#A46A50]">
            <CalendarDays size={15} /> Calendar
          </div>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[#1E2D2F]">
            {format(visibleMonth, "MMMM yyyy")}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setVisibleMonth(startOfMonth(new Date(todayStartMs)))}
            className="rounded-full border border-[#DED4CA] bg-[var(--app-surface-soft)] px-4 py-2 text-sm font-semibold text-[#4D4540] transition hover:border-[#EE6A3C] hover:text-[#B64B28]"
          >
            Today
          </button>
          <div className="flex overflow-hidden rounded-full border border-[#DED4CA] bg-[var(--app-surface-soft)]">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setVisibleMonth((current) => subMonths(current, 1))}
              className="grid h-10 w-10 place-items-center text-[#5E554F] transition hover:bg-[var(--app-surface)] hover:text-[#B64B28]"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setVisibleMonth((current) => addMonths(current, 1))}
              className="grid h-10 w-10 place-items-center border-l border-[#DED4CA] text-[#5E554F] transition hover:bg-[var(--app-surface)] hover:text-[#B64B28]"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </header>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 overflow-x-auto">
          <div className="min-w-[620px]">
            <div className="grid grid-cols-7 border-b border-[#E8DED5] bg-[var(--app-surface-soft)]">
              {weekdayLabels.map((label) => (
                <div
                  key={label}
                  className="px-3 py-2 text-center text-[11px] font-bold uppercase tracking-[0.16em] text-[#8B7C72]"
                >
                  {label}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {calendarDays.map((day) => {
                const key = calendarDateKey(day);
                const dayTasks = dated.get(key) ?? [];
                const muted = !isSameMonth(day, visibleMonth);
                const active = activeDropKey === key;
                return (
                  <div
                    key={key}
                    data-calendar-date={key}
                    onDragOver={(event) => allowDrop(event, key)}
                    onDragLeave={(event) => {
                      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                      setActiveDropKey((current) => (current === key ? null : current));
                    }}
                    onDrop={(event) => dropOnDate(event, day)}
                    className={`group min-h-[142px] border-b border-r border-[#E8DED5] p-2 transition ${
                      muted ? "bg-[color-mix(in_srgb,var(--app-surface-soft)_55%,transparent)]" : "bg-[var(--app-surface)]"
                    } ${active ? "relative z-10 bg-[#FFF2EB] shadow-[inset_0_0_0_2px_#EE6A3C]" : ""}`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span
                        className={`grid h-7 min-w-7 place-items-center rounded-full px-1 text-xs font-semibold ${
                          isToday(day)
                            ? "bg-[#EE6A3C] text-white shadow-sm"
                            : muted
                              ? "text-[#B7ABA2]"
                              : "text-[#5D554F]"
                        }`}
                      >
                        {format(day, "d")}
                      </span>
                      {active ? (
                        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#B64B28]">
                          Move here
                        </span>
                      ) : null}
                    </div>
                    <div className="max-h-[112px] space-y-1 overflow-y-auto pr-0.5">
                      {dayTasks.map((task) => (
                        <CalendarTaskChip
                          key={task.id}
                          task={task}
                          contextLabel={taskContext(task)}
                          projectColor={
                            task.projectId
                              ? projectById.get(task.projectId)?.color
                              : undefined
                          }
                          dragging={draggedTaskId === task.id}
                          onDragStart={beginDrag}
                          onDragEnd={() => {
                            setDraggedTaskId(null);
                            setActiveDropKey(null);
                          }}
                          onOpenTask={onOpenTask}
                          onToggleTask={onToggleTask}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <aside
          data-calendar-no-date="true"
          onDragOver={(event) => allowDrop(event, "__no_date__")}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
            setActiveDropKey((current) => current === "__no_date__" ? null : current);
          }}
          onDrop={dropWithoutDate}
          className={`order-first border-b border-[#E8DED5] p-4 transition lg:order-none lg:border-b-0 lg:border-l ${
            activeDropKey === "__no_date__"
              ? "bg-[#FFF2EB] shadow-[inset_0_0_0_2px_#EE6A3C]"
              : "bg-[color-mix(in_srgb,var(--app-surface-soft)_70%,transparent)]"
          }`}
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-2xl bg-[var(--app-surface)] text-[#A46A50] shadow-sm">
                <Inbox size={17} />
              </span>
              <div>
                <h3 className="font-semibold text-[#1E2D2F]">No date</h3>
                <p className="text-xs text-[#8B7C72]">Plan these when ready</p>
              </div>
            </div>
            <span className="rounded-full bg-[var(--app-surface)] px-2.5 py-1 text-xs font-bold text-[#6D5C50] shadow-sm">
              {undated.length}
            </span>
          </div>
          {activeDropKey === "__no_date__" ? (
            <div className="mb-3 rounded-2xl border border-dashed border-[#EE6A3C] bg-[#FFF8F4] px-3 py-4 text-center text-xs font-bold uppercase tracking-[0.16em] text-[#B64B28]">
              Remove due date
            </div>
          ) : null}
          <div className="max-h-[620px] space-y-2 overflow-y-auto pr-1">
            {undated.length ? (
              undated.map((task) => (
                <CalendarTaskChip
                  key={task.id}
                  task={task}
                  contextLabel={taskContext(task)}
                  projectColor={
                    task.projectId
                      ? projectById.get(task.projectId)?.color
                      : undefined
                  }
                  dragging={draggedTaskId === task.id}
                  spacious
                  onDragStart={beginDrag}
                  onDragEnd={() => {
                    setDraggedTaskId(null);
                    setActiveDropKey(null);
                  }}
                  onOpenTask={onOpenTask}
                  onToggleTask={onToggleTask}
                />
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-[#D7C9BE] px-4 py-8 text-center text-sm leading-6 text-[#8B7C72]">
                Every task has a date. Drag one here to clear it.
              </div>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}

function CalendarTaskChip({
  task,
  contextLabel,
  projectColor,
  dragging,
  spacious = false,
  onDragStart,
  onDragEnd,
  onOpenTask,
  onToggleTask,
}: {
  task: Task;
  contextLabel: string | null;
  projectColor?: string;
  dragging: boolean;
  spacious?: boolean;
  onDragStart: (event: DragEvent<HTMLElement>, taskId: string) => void;
  onDragEnd: () => void;
  onOpenTask: (taskId: string) => void;
  onToggleTask: (taskId: string) => void;
}) {
  const timed = task.dueAt !== null && !task.allDay;
  return (
    <article
      draggable
      role="button"
      tabIndex={0}
      data-calendar-task-id={task.id}
      onDragStart={(event) => onDragStart(event, task.id)}
      onDragEnd={onDragEnd}
      onClick={() => onOpenTask(task.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenTask(task.id);
        }
      }}
      className={`group/task flex cursor-grab items-start rounded-xl border border-[#E4DAD1] bg-[var(--app-surface)] shadow-[0_2px_8px_rgba(72,51,36,0.06)] transition hover:-translate-y-0.5 hover:border-[#D0B9AA] hover:shadow-md active:cursor-grabbing ${
        spacious ? "gap-2 p-2.5" : "gap-1 px-1.5 py-1.5"
      } ${dragging ? "opacity-40" : ""}`}
      style={{ borderLeftColor: projectColor ?? "#EE6A3C", borderLeftWidth: 3 }}
    >
      {spacious ? (
        <button
          type="button"
          aria-label={`Complete ${task.title}`}
          onClick={(event) => {
            event.stopPropagation();
            onToggleTask(task.id);
          }}
          className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border border-[#B8AAA0] text-transparent transition hover:border-[#EE6A3C] hover:bg-[#FFF1EB] hover:text-[#EE6A3C]"
        >
          <Check size={10} strokeWidth={3} />
        </button>
      ) : null}
      <div className="min-w-0 flex-1 text-left">
        <span className="block truncate text-xs font-semibold leading-5 text-[#2C2926]">
          {task.title}
        </span>
        {spacious && contextLabel ? (
          <span className="mt-0.5 block truncate text-[11px] font-medium text-[#8A7568]">
            {contextLabel}
          </span>
        ) : null}
        {timed ? (
          <span className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold text-[#A46A50]">
            <Clock3 size={10} /> {formatClock(task.dueAt!)}
          </span>
        ) : null}
      </div>
      {spacious ? (
        <GripVertical
          size={13}
          className="mt-0.5 shrink-0 text-[#B7AAA0] opacity-0 transition group-hover/task:opacity-100"
          aria-hidden="true"
        />
      ) : null}
    </article>
  );
}
