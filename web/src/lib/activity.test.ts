import { describe, expect, it } from 'vitest';
import type { Reminder, Task } from '../types/sync';
import { appendActivityEntry, buildTaskTimeline, getTaskActivityEntries } from './activity';

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Pay rent',
    description: '',
    projectId: null,
    sectionId: null,
    priority: 'P4',
    dueAt: new Date('2026-04-02T00:00:00').getTime(),
    allDay: true,
    deadlineAt: null,
    deadlineAllDay: false,
    recurringRule: null,
    deadlineRecurringRule: null,
    status: 'OPEN',
    completedAt: null,
    parentTaskId: null,
    locationId: null,
    locationTriggerType: null,
    order: 0,
    createdAt: new Date('2026-04-01T08:00:00').getTime(),
    updatedAt: new Date('2026-04-01T09:00:00').getTime(),
    deletedAt: null,
    ...overrides,
  };
}

function createReminder(taskId: string): Reminder {
  return {
    id: 'rem-1',
    taskId,
    type: 'TIME',
    timeAt: null,
    offsetMinutes: 30,
    locationId: null,
    locationTriggerType: null,
    enabled: true,
    ephemeral: false,
    createdAt: new Date('2026-04-01T08:10:00').getTime(),
    updatedAt: new Date('2026-04-01T08:10:00').getTime(),
    deletedAt: null,
  };
}

describe('activity', () => {
  it('appends activity entries newest first', () => {
    const entries = appendActivityEntry([], {
      id: '1',
      createdAt: 10,
      taskIds: ['task-1'],
      title: 'Updated task',
    });

    const next = appendActivityEntry(entries, {
      id: '2',
      createdAt: 15,
      taskIds: ['task-1'],
      title: 'Archived task',
    });

    expect(next.map(entry => entry.id)).toEqual(['2', '1']);
  });

  it('filters task activity entries by task id', () => {
    const entries = [
      { id: '1', createdAt: 10, taskIds: ['task-1'], title: 'Updated task' },
      { id: '2', createdAt: 20, taskIds: ['task-2'], title: 'Updated other task' },
    ];

    expect(getTaskActivityEntries(entries, 'task-1')).toEqual([entries[0]]);
  });

  it('builds a combined task timeline from system and activity events', () => {
    const task = createTask();
    const timeline = buildTaskTimeline(task, [createReminder(task.id)], [
      {
        id: 'activity-1',
        createdAt: new Date('2026-04-01T10:00:00').getTime(),
        taskIds: [task.id],
        title: 'Saved from task detail',
        detail: 'Inline parser updated the project and due date.',
      },
    ]);

    expect(timeline.some(entry => entry.title === 'Saved from task detail')).toBe(true);
    expect(timeline.some(entry => entry.title === 'Created task')).toBe(true);
    expect(timeline.some(entry => entry.title === 'Reminder updated')).toBe(true);
  });
});
