import { describe, expect, it, vi } from 'vitest';
import type { Project, Section, SyncPayload, Task } from '../types/sync';
import { createEmptySyncPayload } from './syncPayload';
import { buildBulkSubtaskDrafts, buildSubtaskDraft } from './subtaskDrafts';
import { createTask, getTaskReminderDrafts, getSubtasks } from './workspace';

function createPayload(): SyncPayload {
  const projects: Project[] = [
    {
      id: 'project-parent',
      name: 'dailies',
      color: '#EE6A3C',
      favorite: false,
      order: 0,
      archived: false,
      viewPreference: 'LIST',
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null,
    },
    {
      id: 'project-bills',
      name: 'bills',
      color: '#EE6A3C',
      favorite: false,
      order: 1,
      archived: false,
      viewPreference: 'LIST',
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null,
    },
  ];
  const sections: Section[] = [
    {
      id: 'section-parent',
      projectId: 'project-parent',
      name: 'home',
      order: 0,
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null,
    },
    {
      id: 'section-monthly',
      projectId: 'project-bills',
      name: 'monthly',
      order: 0,
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null,
    },
  ];
  const parentTask: Task = {
    id: 'parent-task',
    title: 'Parent',
    description: '',
    projectId: 'project-parent',
    sectionId: 'section-parent',
    priority: 'P3',
    dueAt: null,
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
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
  };

  return {
    ...createEmptySyncPayload('device-test'),
    projects,
    sections,
    tasks: [
      parentTask,
      {
        ...parentTask,
        id: 'existing-child',
        title: 'Existing child',
        parentTaskId: parentTask.id,
        order: 4,
      },
    ],
  };
}

describe('subtaskDrafts', () => {
  it('inherits the parent project and section when a line has no overrides', () => {
    const payload = createPayload();
    const parentTask = payload.tasks[0];
    const draft = buildSubtaskDraft(
      payload,
      parentTask,
      'call mom tomorrow 8am',
      new Date(2026, 3, 3, 0, 0, 0, 0).getTime(),
    );

    expect(draft).toMatchObject({
      projectId: 'project-parent',
      sectionId: 'section-parent',
      parentTaskId: 'parent-task',
    });
    expect(draft.dueAt).toBe(new Date(2026, 3, 4, 8, 0, 0, 0).getTime());
  });

  it('keeps per-line project and section overrides for subtasks', () => {
    const payload = createPayload();
    const parentTask = payload.tasks[0];
    const draft = buildSubtaskDraft(
      payload,
      parentTask,
      'pay rent p1 #bills/monthly',
      new Date(2026, 3, 3, 0, 0, 0, 0).getTime(),
    );

    expect(draft).toMatchObject({
      projectId: 'project-bills',
      sectionId: 'section-monthly',
      priority: 'P1',
      parentTaskId: 'parent-task',
    });
  });

  it('preserves parsed reminder drafts for timed subtask entries', () => {
    const payload = createPayload();
    const parentTask = payload.tasks[0];
    const draft = buildSubtaskDraft(
      payload,
      parentTask,
      'doctor appointment tomorrow 9am remind me 30m before',
      new Date(2026, 3, 3, 0, 0, 0, 0).getTime(),
    );
    const updated = createTask(payload, draft);
    const created = updated.tasks.find(task => task.parentTaskId === 'parent-task' && task.id !== 'existing-child');

    expect(created?.title).toBe('doctor appointment');
    expect(getTaskReminderDrafts(updated, created!.id)).toEqual([{ kind: 'OFFSET', offsetMinutes: 30 }]);
  });

  it('keeps sequential sibling order when creating multiple subtasks', () => {
    vi.spyOn(Date, 'now').mockReturnValue(5_000);
    const payload = createPayload();
    const parentTask = payload.tasks[0];
    const drafts = buildBulkSubtaskDrafts(
      payload,
      parentTask,
      ['one', 'two'],
      new Date(2026, 3, 3, 0, 0, 0, 0).getTime(),
    );

    const withOne = createTask(payload, drafts[0]);
    const withTwo = createTask(withOne, drafts[1]);
    const subtasks = getSubtasks(withTwo, parentTask.id).sort((left, right) => left.order - right.order);

    expect(subtasks.map(task => task.order)).toEqual([4, 5, 6]);
  });
});
