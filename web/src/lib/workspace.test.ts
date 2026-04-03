import { describe, expect, it, vi, afterEach } from 'vitest';
import { createEmptySyncPayload } from './syncPayload';
import {
  canReparentTaskAsSubtask,
  createTask as createWorkspaceTask,
  createTaskDraft,
  deleteTasks,
  flattenTasksWithSubtasks,
  getSubtasks,
  getTaskReminderDrafts,
  getTodayViewData,
  getUpcomingOpenTasks,
  moveTasksToSection,
  moveTasksToProject,
  promoteSubtask,
  repairRecurringTasks,
  reparentTaskAsSubtask,
  rescheduleTasksToDate,
  searchTasks,
  setPriorityForTasks,
  toggleTaskCompletion,
  updateTaskFromDraft,
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

  it('moves selected tasks into a section and aligns the project automatically', () => {
    vi.spyOn(Date, 'now').mockReturnValue(6500);
    const payload = createPayload();

    const updated = moveTasksToSection(payload, ['task-open'], 'section-weekend');

    expect(updated.tasks.find(task => task.id === 'task-open')).toMatchObject({
      projectId: 'project-home',
      sectionId: 'section-weekend',
      updatedAt: 6500,
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

  it('returns only overdue and future-dated open tasks for Upcoming selection', () => {
    const payload = createPayload();
    payload.tasks.push(
      createTask({
        id: 'task-future',
        title: 'Future task',
        dueAt: new Date('2026-04-03T00:00:00').getTime(),
        allDay: true,
      }),
      createTask({
        id: 'task-completed-future',
        title: 'Completed future task',
        dueAt: new Date('2026-04-03T00:00:00').getTime(),
        allDay: true,
        status: 'COMPLETED',
        completedAt: new Date('2026-03-31T12:00:00').getTime(),
      }),
    );

    const upcoming = getUpcomingOpenTasks(payload, new Date('2026-03-31T00:00:00').getTime());

    expect(upcoming.map(task => task.id)).toEqual([
      'task-overdue',
      'task-future',
    ]);
  });

  it('keeps matching subtasks attached to their parent in search results', () => {
    const payload = createPayload();
    payload.tasks.push(
      createTask({ id: 'task-parent-search', title: 'Plan launch', order: 10 }),
      createTask({ id: 'task-child-search', title: 'Draft launch copy', parentTaskId: 'task-parent-search', order: 11 }),
    );

    const results = searchTasks(payload, 'draft launch', new Set(['ALL']));

    expect(results.map(task => task.id)).toEqual([
      'task-parent-search',
      'task-child-search',
    ]);
  });

  it('flattens visible task hierarchies and leaves orphan subtasks at the root', () => {
    const tasks = [
      createTask({ id: 'task-parent', title: 'Parent', order: 0 }),
      createTask({ id: 'task-child', title: 'Child', parentTaskId: 'task-parent', order: 1 }),
      createTask({ id: 'task-grandchild', title: 'Grandchild', parentTaskId: 'task-child', order: 2 }),
      createTask({ id: 'task-orphan', title: 'Orphan child', parentTaskId: 'missing-parent', order: 3 }),
    ];

    const flattened = flattenTasksWithSubtasks(tasks);

    expect(flattened.map(item => [item.task.id, item.depth])).toEqual([
      ['task-parent', 0],
      ['task-child', 1],
      ['task-grandchild', 2],
      ['task-orphan', 0],
    ]);
    expect(flattened[0]).toMatchObject({ hasVisibleSubtasks: true, visibleSubtaskCount: 1 });
    expect(flattened[1]).toMatchObject({ hasVisibleSubtasks: true, visibleSubtaskCount: 1 });
    expect(flattened[2]).toMatchObject({ hasVisibleSubtasks: false, visibleSubtaskCount: 0 });
  });

  it('returns direct subtasks without archived children', () => {
    const payload = createPayload();
    payload.tasks.push(
      createTask({ id: 'task-parent', title: 'Parent task' }),
      createTask({ id: 'task-child-open', title: 'Open child', parentTaskId: 'task-parent', order: 0 }),
      createTask({ id: 'task-child-complete', title: 'Completed child', parentTaskId: 'task-parent', status: 'COMPLETED', completedAt: 5, order: 1 }),
      createTask({ id: 'task-child-archived', title: 'Archived child', parentTaskId: 'task-parent', status: 'ARCHIVED', order: 2 }),
    );

    expect(getSubtasks(payload, 'task-parent').map(task => task.id)).toEqual([
      'task-child-open',
      'task-child-complete',
    ]);
  });

  it('creates subtasks with the parent task id intact', () => {
    vi.spyOn(Date, 'now').mockReturnValue(9000);
    const payload = createPayload();
    const draft = createTaskDraft('project-home');
    draft.title = 'Follow up on rent';
    draft.sectionId = 'section-weekend';
    draft.parentTaskId = 'task-today';

    const updated = createWorkspaceTask(payload, draft);
    const createdTask = updated.tasks.find(task => task.title === 'Follow up on rent');

    expect(createdTask).toMatchObject({
      parentTaskId: 'task-today',
      projectId: 'project-home',
      sectionId: 'section-weekend',
      status: 'OPEN',
    });
  });

  it('reparents a task as a subtask and inherits the parent project and section', () => {
    vi.spyOn(Date, 'now').mockReturnValue(9500);
    const payload = createPayload();
    payload.tasks.push(
      createTask({ id: 'task-parent', title: 'Parent', projectId: 'project-home', sectionId: 'section-weekend', order: 2 }),
      createTask({ id: 'task-target', title: 'Target', projectId: null, sectionId: null, order: 0 }),
      createTask({ id: 'task-existing-child', title: 'Existing child', parentTaskId: 'task-parent', projectId: 'project-home', sectionId: 'section-weekend', order: 4 }),
    );

    const updated = reparentTaskAsSubtask(payload, 'task-target', 'task-parent');
    const movedTask = updated.tasks.find(task => task.id === 'task-target');

    expect(movedTask).toMatchObject({
      parentTaskId: 'task-parent',
      projectId: 'project-home',
      sectionId: 'section-weekend',
      order: 5,
      updatedAt: 9500,
    });
  });

  it('rejects invalid subtask reparent targets', () => {
    const payload = createPayload();
    payload.tasks.push(
      createTask({ id: 'task-parent', title: 'Parent' }),
      createTask({ id: 'task-child', title: 'Child', parentTaskId: 'task-parent' }),
      createTask({ id: 'task-other-parent', title: 'Other parent', parentTaskId: 'task-parent' }),
    );

    expect(canReparentTaskAsSubtask(payload, 'task-parent', 'task-parent')).toBe(false);
    expect(canReparentTaskAsSubtask(payload, 'task-parent', 'task-child')).toBe(false);
    expect(canReparentTaskAsSubtask(payload, 'task-child', 'task-parent')).toBe(false);
    expect(reparentTaskAsSubtask(payload, 'task-parent', 'task-child')).toBe(payload);
  });

  it('promotes a subtask back out one level while keeping the parent location', () => {
    vi.spyOn(Date, 'now').mockReturnValue(9600);
    const payload = createPayload();
    payload.tasks.push(
      createTask({ id: 'task-parent', title: 'Parent', projectId: 'project-home', sectionId: 'section-weekend', order: 2 }),
      createTask({ id: 'task-child', title: 'Child', parentTaskId: 'task-parent', projectId: 'project-home', sectionId: 'section-weekend', order: 0 }),
    );

    const updated = promoteSubtask(payload, 'task-child');
    const promotedTask = updated.tasks.find(task => task.id === 'task-child');

    expect(promotedTask).toMatchObject({
      parentTaskId: null,
      projectId: 'project-home',
      sectionId: 'section-weekend',
      updatedAt: 9600,
    });
  });

  it('reads reminder drafts for a task in a stable order', () => {
    const payload = createPayload();

    expect(getTaskReminderDrafts(payload, 'task-overdue')).toEqual([
      { kind: 'ABSOLUTE', timeAt: new Date('2026-03-30T09:00:00').getTime() },
    ]);
    expect(getTaskReminderDrafts(payload, 'task-open')).toEqual([
      { kind: 'ABSOLUTE', timeAt: new Date('2026-03-31T09:00:00').getTime() },
    ]);
  });

  it('updates task scheduling fields and replaces reminders from a draft', () => {
    vi.spyOn(Date, 'now').mockReturnValue(9900);
    const payload = createPayload();
    const draft = createTaskDraft('project-work');
    draft.title = 'Inbox followup polished';
    draft.description = 'Call back with estimate';
    draft.priority = 'P1';
    draft.dueAt = new Date('2026-04-03T14:00:00').getTime();
    draft.allDay = false;
    draft.deadlineAt = new Date('2026-04-02T00:00:00').getTime();
    draft.deadlineAllDay = true;
    draft.recurringRule = 'FREQ=WEEKLY';
    draft.deadlineRecurringRule = 'FREQ=MONTHLY';
    draft.reminders = [
      { kind: 'OFFSET', offsetMinutes: 30 },
      { kind: 'ABSOLUTE', timeAt: new Date('2026-04-03T10:00:00').getTime() },
    ];

    const updated = updateTaskFromDraft(payload, 'task-open', draft);
    const updatedTask = updated.tasks.find(task => task.id === 'task-open');
    const reminders = getTaskReminderDrafts(updated, 'task-open');

    expect(updatedTask).toMatchObject({
      title: 'Inbox followup polished',
      description: 'Call back with estimate',
      projectId: 'project-work',
      sectionId: null,
      priority: 'P1',
      dueAt: new Date('2026-04-03T14:00:00').getTime(),
      allDay: false,
      deadlineAt: new Date('2026-04-02T00:00:00').getTime(),
      deadlineAllDay: true,
      recurringRule: 'FREQ=WEEKLY',
      deadlineRecurringRule: 'FREQ=MONTHLY',
      updatedAt: 9900,
    });
    expect(reminders).toEqual([
      { kind: 'ABSOLUTE', timeAt: new Date('2026-04-03T10:00:00').getTime() },
      { kind: 'OFFSET', offsetMinutes: 30 },
    ]);
  });

  it('completes a recurring task and creates the next daily occurrence', () => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-04-03T09:30:00').getTime());
    const payload = createPayload();
    payload.tasks.push(
      createTask({
        id: 'task-daily',
        title: 'Daily workout',
        dueAt: new Date('2026-04-03T09:00:00').getTime(),
        allDay: false,
        recurringRule: 'FREQ=DAILY',
        projectId: 'project-home',
      }),
    );
    payload.reminders.push(
      createReminder({
        id: 'reminder-daily',
        taskId: 'task-daily',
        timeAt: new Date('2026-04-03T08:30:00').getTime(),
      }),
    );

    const updated = toggleTaskCompletion(payload, 'task-daily');
    const completed = updated.tasks.find(task => task.id === 'task-daily');
    const successors = updated.tasks.filter(task => task.title === 'Daily workout' && task.id !== 'task-daily');

    expect(completed).toMatchObject({
      status: 'COMPLETED',
      completedAt: new Date('2026-04-03T09:30:00').getTime(),
    });
    expect(successors).toHaveLength(1);
    expect(successors[0]).toMatchObject({
      status: 'OPEN',
      recurringRule: 'FREQ=DAILY',
      dueAt: new Date('2026-04-04T09:00:00').getTime(),
    });
    expect(updated.reminders.filter(reminder => reminder.taskId === successors[0].id)).toMatchObject([
      {
        timeAt: new Date('2026-04-04T08:30:00').getTime(),
      },
    ]);
  });

  it('uses the completion day as the recurrence base for overdue recurring tasks', () => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-04-05T11:15:00').getTime());
    const payload = createPayload();
    payload.tasks.push(
      createTask({
        id: 'task-overdue-recurring',
        title: 'Water plants',
        dueAt: new Date('2026-04-03T10:00:00').getTime(),
        allDay: false,
        recurringRule: 'FREQ=DAILY',
      }),
    );

    const updated = toggleTaskCompletion(payload, 'task-overdue-recurring');
    const successor = updated.tasks.find(task => task.title === 'Water plants' && task.id !== 'task-overdue-recurring');

    expect(successor?.dueAt).toBe(new Date('2026-04-06T10:00:00').getTime());
  });

  it('repairs completed recurring tasks that are missing their next occurrence', () => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-04-06T08:00:00').getTime());
    const payload = createPayload();
    payload.tasks.push(
      createTask({
        id: 'task-missing-successor',
        title: 'Take vitamins',
        dueAt: new Date('2026-04-05T00:00:00').getTime(),
        allDay: true,
        recurringRule: 'FREQ=DAILY',
        status: 'COMPLETED',
        completedAt: new Date('2026-04-05T07:00:00').getTime(),
      }),
    );

    const repaired = repairRecurringTasks(payload);
    const successor = repaired.payload.tasks.find(task => task.title === 'Take vitamins' && task.id !== 'task-missing-successor');

    expect(repaired.repairedCount).toBe(1);
    expect(successor).toMatchObject({
      status: 'OPEN',
      dueAt: new Date('2026-04-06T00:00:00').getTime(),
      recurringRule: 'FREQ=DAILY',
    });
  });

  it('reopening a completed recurring task removes its generated successor', () => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-04-06T08:00:00').getTime());
    const payload = createPayload();
    payload.tasks.push(
      createTask({
        id: 'task-daily-completed',
        title: 'Journal',
        dueAt: new Date('2026-04-05T00:00:00').getTime(),
        allDay: true,
        recurringRule: 'FREQ=DAILY',
        status: 'COMPLETED',
        completedAt: new Date('2026-04-05T21:00:00').getTime(),
      }),
      createTask({
        id: 'task-daily-next',
        title: 'Journal',
        dueAt: new Date('2026-04-06T00:00:00').getTime(),
        allDay: true,
        recurringRule: 'FREQ=DAILY',
      }),
    );

    const reopened = toggleTaskCompletion(payload, 'task-daily-completed');
    const reopenedTask = reopened.tasks.find(task => task.id === 'task-daily-completed');
    const successor = reopened.tasks.find(task => task.id === 'task-daily-next');

    expect(reopenedTask).toMatchObject({
      status: 'OPEN',
      completedAt: null,
    });
    expect(successor?.deletedAt).toBe(new Date('2026-04-06T08:00:00').getTime());
  });

  it('does not duplicate an already-generated recurring successor during repair', () => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-04-06T08:00:00').getTime());
    const payload = createPayload();
    payload.tasks.push(
      createTask({
        id: 'task-weekly-complete',
        title: 'Math homework',
        projectId: 'project-work',
        dueAt: new Date('2026-04-02T00:00:00').getTime(),
        recurringRule: 'FREQ=WEEKLY',
        status: 'COMPLETED',
        completedAt: new Date('2026-04-03T10:00:00').getTime(),
      }),
      createTask({
        id: 'task-weekly-next',
        title: 'Math homework',
        projectId: 'project-work',
        dueAt: new Date('2026-04-10T00:00:00').getTime(),
        recurringRule: 'FREQ=WEEKLY',
      }),
    );

    const repaired = repairRecurringTasks(payload);

    expect(repaired.repairedCount).toBe(0);
    expect(repaired.payload.tasks.filter(task => task.title === 'Math homework')).toHaveLength(2);
  });
});
