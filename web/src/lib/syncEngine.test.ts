import { describe, expect, it } from 'vitest';
import { SyncEngine } from './syncEngine';
import {
  TEST_NOW,
  createTestLocation,
  createTestPayload,
  createTestProject,
  createTestReminder,
  createTestSection,
  createTestTask,
} from './testSyncBuilders';
import { repairRecurringTasks } from './workspace';

describe('SyncEngine', () => {
  const engine = new SyncEngine(() => TEST_NOW, 'web-test');

  it('uses last-writer-wins for conflicting task updates', () => {
    const local = createTestPayload({ tasks: [createTestTask({ updatedAt: 10, title: 'Local title' })] });
    const remote = createTestPayload({ tasks: [createTestTask({ updatedAt: 20, title: 'Remote title' })] });

    expect(engine.mergePayloads(local, remote).tasks[0]).toMatchObject({
      title: 'Remote title',
      updatedAt: 20,
    });
  });

  it('lets tombstones beat older live rows and newer live rows beat older tombstones', () => {
    const tombstoneWins = engine.mergePayloads(
      createTestPayload({ tasks: [createTestTask({ updatedAt: 10 })] }),
      createTestPayload({ tasks: [createTestTask({ updatedAt: 20, deletedAt: 20 })] }),
    );
    expect(tombstoneWins.tasks[0].deletedAt).toBe(20);

    const liveWins = engine.mergePayloads(
      createTestPayload({ tasks: [createTestTask({ updatedAt: 10, deletedAt: 10 })] }),
      createTestPayload({ tasks: [createTestTask({ updatedAt: 20, title: 'Recreated task' })] }),
    );
    expect(liveWins.tasks[0]).toMatchObject({
      title: 'Recreated task',
      deletedAt: null,
    });
  });

  it('does not treat a missing row as a deletion', () => {
    const local = createTestPayload({ tasks: [createTestTask({ id: 'task-1', updatedAt: 10 })] });
    const remote = createTestPayload({ tasks: [] });

    expect(engine.mergePayloads(local, remote).tasks.map(task => task.id)).toEqual(['task-1']);
  });

  it('drops reminders for completed tasks and repairs invalid task references', () => {
    const project = createTestProject();
    const local = createTestPayload({
      projects: [project],
      sections: [createTestSection({ projectId: project.id })],
      tasks: [createTestTask({
        id: 'child',
        projectId: project.id,
        sectionId: 'missing-section',
        parentTaskId: 'missing-parent',
        updatedAt: 10,
        status: 'COMPLETED',
      })],
      reminders: [createTestReminder({ updatedAt: 10 })],
    });

    const merged = engine.mergePayloads(local, createTestPayload());

    expect(merged.tasks[0]).toMatchObject({
      sectionId: null,
      parentTaskId: null,
      updatedAt: TEST_NOW,
    });
    expect(merged.reminders).toEqual([]);
  });

  it('tombstones dependent sections and clears task project references when a project is deleted', () => {
    const project = createTestProject({ updatedAt: 20, deletedAt: 20 });
    const section = createTestSection({ projectId: project.id, updatedAt: 10 });
    const task = createTestTask({ projectId: project.id, sectionId: section.id, updatedAt: 10 });

    const merged = engine.mergePayloads(
      createTestPayload({ projects: [project], sections: [section], tasks: [task] }),
      createTestPayload(),
    );

    expect(merged.sections[0].deletedAt).not.toBeNull();
    expect(merged.tasks[0]).toMatchObject({
      projectId: null,
      sectionId: null,
    });
  });

  it('drops invalid location reminders but normalizes time reminders with missing locations', () => {
    const task = createTestTask();
    const merged = engine.mergePayloads(
      createTestPayload({
        tasks: [task],
        reminders: [
          createTestReminder({
            id: 'time-reminder',
            type: 'TIME',
            locationId: 'missing',
            locationTriggerType: 'ARRIVE',
          }),
          createTestReminder({
            id: 'location-reminder',
            type: 'LOCATION',
            locationId: 'missing',
            locationTriggerType: 'ARRIVE',
          }),
        ],
      }),
      createTestPayload(),
    );

    expect(merged.reminders).toHaveLength(1);
    expect(merged.reminders[0]).toMatchObject({
      id: 'time-reminder',
      locationId: null,
      locationTriggerType: null,
    });
  });

  it('merges locations by updatedAt', () => {
    const local = createTestPayload({ locations: [createTestLocation({ updatedAt: 10, label: 'Local' })] });
    const remote = createTestPayload({ locations: [createTestLocation({ updatedAt: 20, label: 'Remote' })] });

    expect(engine.mergePayloads(local, remote).locations[0].label).toBe('Remote');
  });

  it('does not duplicate a recurring task after sync when the open successor changes priority', () => {
    const completedLocal = createTestTask({
      id: 'task-recurring-completed',
      title: 'wifi bill',
      projectId: 'project-1',
      dueAt: new Date('2026-04-08T00:00:00').getTime(),
      allDay: true,
      recurringRule: 'FREQ=DAILY',
      status: 'COMPLETED',
      completedAt: new Date('2026-04-08T07:00:00').getTime(),
      updatedAt: 10,
    });
    const openRemote = createTestTask({
      id: 'task-recurring-open',
      title: 'wifi bill',
      projectId: 'project-1',
      dueAt: new Date('2026-04-09T00:00:00').getTime(),
      allDay: true,
      recurringRule: 'FREQ=DAILY',
      priority: 'P1',
      updatedAt: 20,
    });

    const merged = engine.mergePayloads(
      createTestPayload({ projects: [createTestProject()], tasks: [completedLocal] }),
      createTestPayload({ projects: [createTestProject()], tasks: [openRemote] }),
    );
    const repaired = repairRecurringTasks(merged);

    const liveTasks = repaired.payload.tasks.filter(task => !task.deletedAt && task.title === 'wifi bill');
    expect(repaired.repairedCount).toBe(0);
    expect(liveTasks).toHaveLength(2);
    expect(liveTasks.filter(task => task.dueAt === new Date('2026-04-09T00:00:00').getTime())).toHaveLength(1);
  });

  it('does not recover a deleted recurring successor after sync merge', () => {
    const completedLocal = createTestTask({
      id: 'task-recurring-completed',
      title: 'laundry',
      projectId: 'project-1',
      dueAt: new Date('2026-04-08T00:00:00').getTime(),
      allDay: true,
      recurringRule: 'FREQ=DAILY',
      status: 'COMPLETED',
      completedAt: new Date('2026-04-08T07:00:00').getTime(),
      updatedAt: 10,
    });
    const deletedRemote = createTestTask({
      id: 'task-recurring-open',
      title: 'laundry',
      projectId: 'project-1',
      dueAt: new Date('2026-04-09T00:00:00').getTime(),
      allDay: true,
      recurringRule: 'FREQ=DAILY',
      deletedAt: 20,
      updatedAt: 20,
    });

    const merged = engine.mergePayloads(
      createTestPayload({ projects: [createTestProject()], tasks: [completedLocal] }),
      createTestPayload({ projects: [createTestProject()], tasks: [deletedRemote] }),
    );
    const repaired = repairRecurringTasks(merged);

    const liveTasks = repaired.payload.tasks.filter(task => !task.deletedAt && task.title === 'laundry');
    expect(repaired.repairedCount).toBe(0);
    expect(liveTasks).toHaveLength(1);
    expect(liveTasks[0].status).toBe('COMPLETED');
  });

  it('does not revert a recurring due-date edit after sync merge and repair', () => {
    const completedLocal = createTestTask({
      id: 'task-recurring-completed',
      title: 'cancel Google one Subscription',
      projectId: 'project-1',
      dueAt: new Date('2026-04-08T00:00:00').getTime(),
      allDay: true,
      recurringRule: 'FREQ=DAILY',
      status: 'COMPLETED',
      completedAt: new Date('2026-04-08T07:00:00').getTime(),
      updatedAt: 10,
    });
    const dueEditedRemote = createTestTask({
      id: 'task-recurring-open',
      title: 'cancel Google one Subscription',
      projectId: 'project-1',
      dueAt: new Date('2026-04-14T00:00:00').getTime(),
      allDay: true,
      recurringRule: 'FREQ=DAILY',
      updatedAt: 20,
    });

    const merged = engine.mergePayloads(
      createTestPayload({ projects: [createTestProject()], tasks: [completedLocal] }),
      createTestPayload({ projects: [createTestProject()], tasks: [dueEditedRemote] }),
    );
    const repaired = repairRecurringTasks(merged);

    const liveTasks = repaired.payload.tasks.filter(task => !task.deletedAt && task.title === 'cancel Google one Subscription');
    expect(repaired.repairedCount).toBe(0);
    expect(liveTasks).toHaveLength(2);
    expect(liveTasks.filter(task => task.status === 'OPEN').map(task => task.dueAt)).toEqual([
      new Date('2026-04-14T00:00:00').getTime(),
    ]);
  });
});
