import { describe, expect, it, vi, afterEach } from 'vitest';
import { createEmptySyncPayload } from './syncPayload';
import {
  deleteTasks,
  getTodayViewData,
  moveTasksToProject,
  rescheduleTasksToDate,
  setPriorityForTasks,
} from './workspace';
import type { Reminder, SyncPayload, Task } from '../types/sync';

afterEach(() => {
  vi.restoreAllMocks();
});

function createTask(overrides: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    id: overrides.id,
    title: overrides.title,
    description: overrides.description ?? '',
    projectId: overrides.projectId ?? null,
    sectionId: overrides.sectionId ?? null,
    priority: overrides.priority ?? 'P4',
    dueAt: overrides.dueAt ?? null,
    allDay: overrides.allDay ?? true,
    deadlineAt: overrides.deadlineAt ?? null,
    deadlineAllDay: overrides.deadlineAllDay ?? false,
    recurringRule: overrides.recurringRule ?? null,
    deadlineRecurringRule: overrides.deadlineRecurringRule ?? null,
    status: overrides.status ?? 'OPEN',
    completedAt: overrides.completedAt ?? null,
    parentTaskId: overrides.parentTaskId ?? null,
    locationId: overrides.locationId ?? null,
    locationTriggerType: overrides.locationTriggerType ?? null,
    order: overrides.order ?? 0,
    createdAt: overrides.createdAt ?? 1,
    updatedAt: overrides.updatedAt ?? 1,
    deletedAt: overrides.deletedAt ?? null,
  };
}

function createReminder(overrides: Partial<Reminder> & Pick<Reminder, 'id' | 'taskId'>): Reminder {
  return {
    id: overrides.id,
    taskId: overrides.taskId,
    type: overrides.type ?? 'TIME',
    timeAt: overrides.timeAt ?? null,
    offsetMinutes: overrides.offsetMinutes ?? null,
    locationId: overrides.locationId ?? null,
    locationTriggerType: overrides.locationTriggerType ?? null,
    enabled: overrides.enabled ?? true,
    ephemeral: overrides.ephemeral ?? false,
    createdAt: overrides.createdAt ?? 1,
    updatedAt: overrides.updatedAt ?? 1,
    deletedAt: overrides.deletedAt ?? null,
  };
}

function createPayload(): SyncPayload {
  return {
    ...createEmptySyncPayload('device-test'),
    projects: [
      {
        id: 'project-home',
        name: 'Home',
        color: '#EE6A3C',
        favorite: false,
        order: 0,
        archived: false,
        viewPreference: 'LIST',
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
      },
      {
        id: 'project-work',
        name: 'Work',
        color: '#4EA0D8',
        favorite: false,
        order: 1,
        archived: false,
        viewPreference: 'LIST',
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
      },
    ],
    sections: [
      {
        id: 'section-weekend',
        projectId: 'project-home',
        name: 'Weekend',
        order: 0,
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
      },
    ],
    tasks: [
      createTask({
        id: 'task-overdue',
        title: 'Replace filter',
        projectId: 'project-home',
        sectionId: 'section-weekend',
        dueAt: new Date('2026-03-30T00:00:00').getTime(),
        allDay: true,
      }),
      createTask({
        id: 'task-today',
        title: 'Pay rent',
        projectId: 'project-home',
        sectionId: 'section-weekend',
        dueAt: new Date('2026-03-31T00:00:00').getTime(),
        allDay: true,
      }),
      createTask({
        id: 'task-open',
        title: 'Inbox followup',
      }),
    ],
    reminders: [
      createReminder({ id: 'reminder-overdue', taskId: 'task-overdue', timeAt: new Date('2026-03-30T09:00:00').getTime() }),
      createReminder({ id: 'reminder-open', taskId: 'task-open', timeAt: new Date('2026-03-31T09:00:00').getTime() }),
    ],
  };
}

describe('workspace bulk task helpers', () => {
  it('reschedules only the selected tasks to a new all-day date', () => {
    vi.spyOn(Date, 'now').mockReturnValue(5000);
    const payload = createPayload();
    const nextDueAt = new Date('2026-04-02T00:00:00').getTime();

    const updated = rescheduleTasksToDate(payload, ['task-overdue', 'task-open'], nextDueAt);

    expect(updated.tasks.find(task => task.id === 'task-overdue')).toMatchObject({
      dueAt: nextDueAt,
      allDay: true,
      updatedAt: 5000,
    });
    expect(updated.tasks.find(task => task.id === 'task-open')).toMatchObject({
      dueAt: nextDueAt,
      allDay: true,
      updatedAt: 5000,
    });
    expect(updated.tasks.find(task => task.id === 'task-today')).toMatchObject({
      dueAt: new Date('2026-03-31T00:00:00').getTime(),
      allDay: true,
      updatedAt: 1,
    });
  });

  it('moves selected tasks into a new project and clears their section', () => {
    vi.spyOn(Date, 'now').mockReturnValue(6000);
    const payload = createPayload();

    const updated = moveTasksToProject(payload, ['task-overdue'], 'project-work');

    expect(updated.tasks.find(task => task.id === 'task-overdue')).toMatchObject({
      projectId: 'project-work',
      sectionId: null,
      updatedAt: 6000,
    });
    expect(updated.tasks.find(task => task.id === 'task-today')).toMatchObject({
      projectId: 'project-home',
      sectionId: 'section-weekend',
    });
  });

  it('updates priority only for selected tasks', () => {
    vi.spyOn(Date, 'now').mockReturnValue(7000);
    const payload = createPayload();

    const updated = setPriorityForTasks(payload, ['task-overdue', 'task-open'], 'P1');

    expect(updated.tasks.find(task => task.id === 'task-overdue')?.priority).toBe('P1');
    expect(updated.tasks.find(task => task.id === 'task-open')?.priority).toBe('P1');
    expect(updated.tasks.find(task => task.id === 'task-today')?.priority).toBe('P4');
  });

  it('deletes selected tasks and removes their reminders', () => {
    vi.spyOn(Date, 'now').mockReturnValue(8000);
    const payload = createPayload();

    const updated = deleteTasks(payload, ['task-overdue', 'task-open']);

    expect(updated.tasks.find(task => task.id === 'task-overdue')).toMatchObject({
      deletedAt: 8000,
      updatedAt: 8000,
    });
    expect(updated.tasks.find(task => task.id === 'task-open')).toMatchObject({
      deletedAt: 8000,
      updatedAt: 8000,
    });
    expect(updated.reminders.map(reminder => reminder.id)).toEqual([]);
  });

  it('moves an overdue task into today after rescheduling', () => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-03-31T12:00:00').getTime());
    const payload = createPayload();
    const todayStart = new Date('2026-03-31T00:00:00').getTime();
    const todayEnd = new Date('2026-03-31T23:59:59').getTime();

    const updated = rescheduleTasksToDate(payload, ['task-overdue'], todayStart);
    const todayData = getTodayViewData(updated, todayStart, todayEnd);

    expect(todayData.overdue.map(task => task.id)).not.toContain('task-overdue');
    expect(todayData.today.map(task => task.id)).toContain('task-overdue');
  });
});
