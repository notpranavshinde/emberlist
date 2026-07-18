import {
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
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
  const [movingTaskId, setMovingTaskId] = useState<string | null>(null);
  const [activeDropKey, setActiveDropKey] = useState<string | null>(null);
  const pointerDrag = useRef<{
    taskId: string;
    startX: number;
    startY: number;
    dragging: boolean;
  } | null>(null);
  const suppressNextClick = useRef(false);
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
  const dayByKey = useMemo(
    () => new Map(calendarDays.map((day) => [calendarDateKey(day), day])),
    [calendarDays],
  );

  function dropKeyAtPoint(clientX: number, clientY: number): string | null {
    const target = document.elementFromPoint(clientX, clientY);
    if (target?.closest("[data-calendar-no-date]")) return "__no_date__";
    return target
      ?.closest("[data-calendar-date]")
      ?.getAttribute("data-calendar-date") ?? null;
  }

  function beginPointerDrag(
    event: ReactPointerEvent<HTMLElement>,
    taskId: string,
  ) {
    if (event.button !== 0 || event.pointerType === "mouse") return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerDrag.current = {
      taskId,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
    };
  }

  function updatePointerDrag(event: ReactPointerEvent<HTMLElement>) {
    const current = pointerDrag.current;
    if (!current) return;
    if (
      !current.dragging &&
      Math.hypot(
        event.clientX - current.startX,
        event.clientY - current.startY,
      ) >= 6
    ) {
      current.dragging = true;
      setDraggedTaskId(current.taskId);
    }
    if (!current.dragging) return;
    event.preventDefault();
    setActiveDropKey(dropKeyAtPoint(event.clientX, event.clientY));
  }

  function finishPointerDrag(event: ReactPointerEvent<HTMLElement>) {
    const current = pointerDrag.current;
    pointerDrag.current = null;
    if (!current) return;
    event.currentTarget.releasePointerCapture(event.pointerId);

    if (!current.dragging) {
      suppressNextClick.current = true;
      onOpenTask(current.taskId);
      return;
    }

    event.preventDefault();
    const task = tasks.find((candidate) => candidate.id === current.taskId);
    const dropKey = dropKeyAtPoint(event.clientX, event.clientY);
    setDraggedTaskId(null);
    setActiveDropKey(null);
    if (!task || !dropKey) return;
    if (dropKey === "__no_date__") {
      if (task.dueAt !== null) onRescheduleTasks([task.id], null);
      return;
    }
    const targetDay = dayByKey.get(dropKey);
    if (!targetDay) return;
    const dueAt = moveTaskDueAtToCalendarDate(task, targetDay);
    if (dueAt !== task.dueAt) onRescheduleTasks([task.id], dueAt);
  }

  function cancelPointerDrag() {
    pointerDrag.current = null;
    setDraggedTaskId(null);
    setActiveDropKey(null);
  }

  function moveTaskToDate(taskId: string, targetDate: Date | null) {
    const task = tasks.find((candidate) => candidate.id === taskId);
    if (!task) return;
    const dueAt = moveTaskDueAtToCalendarDate(task, targetDate);
    setMovingTaskId(null);
    if (dueAt !== task.dueAt) onRescheduleTasks([task.id], dueAt);
  }

  const movingTask = movingTaskId
    ? tasks.find((task) => task.id === movingTaskId) ?? null
    : null;

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

      {movingTask ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F0C6B5] bg-[#FFF4EE] px-5 py-3 text-sm text-[#7B4B38] sm:px-6">
          <span>
            Moving <strong>“{movingTask.title}”</strong> — choose a date or No date.
          </span>
          <button
            type="button"
            onClick={() => setMovingTaskId(null)}
            className="rounded-full border border-[#E7B7A3] bg-white px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-[#A64F30]"
          >
            Cancel move
          </button>
        </div>
      ) : null}

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
                    role={movingTask ? "button" : undefined}
                    tabIndex={movingTask ? 0 : undefined}
                    aria-label={
                      movingTask
                        ? `Move ${movingTask.title} to ${format(day, "MMMM d, yyyy")}`
                        : undefined
                    }
                    onClick={() => {
                      if (movingTask) moveTaskToDate(movingTask.id, day);
                    }}
                    onKeyDown={(event) => {
                      if (
                        movingTask &&
                        (event.key === "Enter" || event.key === " ")
                      ) {
                        event.preventDefault();
                        moveTaskToDate(movingTask.id, day);
                      }
                    }}
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
                          dragging={
                            draggedTaskId === task.id || movingTaskId === task.id
                          }
                          onDragStart={beginDrag}
                          onDragEnd={() => {
                            setDraggedTaskId(null);
                            setActiveDropKey(null);
                          }}
                          onPointerDown={beginPointerDrag}
                          onPointerMove={updatePointerDrag}
                          onPointerUp={finishPointerDrag}
                          onPointerCancel={cancelPointerDrag}
                          onBeginMove={setMovingTaskId}
                          suppressNextClickRef={suppressNextClick}
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
          role={movingTask ? "button" : undefined}
          tabIndex={movingTask ? 0 : undefined}
          aria-label={
            movingTask ? `Move ${movingTask.title} to No date` : undefined
          }
          onClick={() => {
            if (movingTask) moveTaskToDate(movingTask.id, null);
          }}
          onKeyDown={(event) => {
            if (
              movingTask &&
              (event.key === "Enter" || event.key === " ")
            ) {
              event.preventDefault();
              moveTaskToDate(movingTask.id, null);
            }
          }}
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
                  dragging={
                    draggedTaskId === task.id || movingTaskId === task.id
                  }
                  spacious
                  onDragStart={beginDrag}
                  onDragEnd={() => {
                    setDraggedTaskId(null);
                    setActiveDropKey(null);
                  }}
                  onPointerDown={beginPointerDrag}
                  onPointerMove={updatePointerDrag}
                  onPointerUp={finishPointerDrag}
                  onPointerCancel={cancelPointerDrag}
                  onBeginMove={setMovingTaskId}
                  suppressNextClickRef={suppressNextClick}
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
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onBeginMove,
  suppressNextClickRef,
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
  onPointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    taskId: string,
  ) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: () => void;
  onBeginMove: (taskId: string) => void;
  suppressNextClickRef: { current: boolean };
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
      onPointerDown={(event) => onPointerDown(event, task.id)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClick={(event) => {
        event.stopPropagation();
        if (suppressNextClickRef.current) {
          suppressNextClickRef.current = false;
          return;
        }
        onOpenTask(task.id);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenTask(task.id);
        }
      }}
      className={`group/task relative flex cursor-grab items-start rounded-xl border border-[#E4DAD1] bg-[var(--app-surface)] shadow-[0_2px_8px_rgba(72,51,36,0.06)] transition hover:-translate-y-0.5 hover:border-[#D0B9AA] hover:shadow-md active:cursor-grabbing ${
        spacious ? "gap-2 p-2.5" : "gap-1 px-1.5 py-1.5"
      } ${dragging ? "opacity-40" : ""}`}
      style={{
        borderLeftColor: projectColor ?? "#EE6A3C",
        borderLeftWidth: 3,
        touchAction: "none",
      }}
    >
      {spacious ? (
        <button
          type="button"
          aria-label={`Complete ${task.title}`}
          onClick={(event) => {
            event.stopPropagation();
            onToggleTask(task.id);
          }}
          onPointerDown={(event) => event.stopPropagation()}
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
      <button
        type="button"
        aria-label={`Move ${task.title}`}
        title="Move task"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onBeginMove(task.id);
        }}
        className="absolute right-0.5 top-1 grid h-6 w-5 place-items-center rounded-lg bg-[var(--app-surface)] text-[#A99A90] opacity-0 shadow-sm transition hover:text-[#B64B28] group-hover/task:opacity-100 group-focus-within/task:opacity-100"
      >
        <GripVertical size={13} aria-hidden="true" />
      </button>
    </article>
  );
}
