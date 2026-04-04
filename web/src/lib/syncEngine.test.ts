import { describe, expect, it } from 'vitest';
import type { Location, Project, Reminder, Section, SyncPayload, Task } from '../types/sync';
import { createEmptySyncPayload } from './syncPayload';
import { SyncEngine } from './syncEngine';
import { repairRecurringTasks } from './workspace';

const NOW = 1_710_000_000_000;

function createPayload(overrides: Partial<SyncPayload> = {}): SyncPayload {
  return {
    ...createEmptySyncPayload('device-a'),
    source: 'web',
    ...overrides,
  };
}

function createProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'project-1',
    name: 'Project',
    color: '#ffffff',
    favorite: false,
    order: 0,
    archived: false,
    viewPreference: null,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    ...overrides,
  };
}

function createSection(overrides: Partial<Section> = {}): Section {
  return {
    id: 'section-1',
    projectId: 'project-1',
    name: 'Section',
    order: 0,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    ...overrides,
  };
}

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Task',
    description: '',
    projectId: null,
    sectionId: null,
    priority: 'P4',
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
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    ...overrides,
  };
}

function createReminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: 'reminder-1',
    taskId: 'task-1',
    type: 'TIME',
    timeAt: 5,
    offsetMinutes: null,
    locationId: null,
    locationTriggerType: null,
    enabled: true,
    ephemeral: false,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    ...overrides,
  };
}

function createLocation(overrides: Partial<Location> = {}): Location {
  return {
    id: 'location-1',
    label: 'Location',
    address: '123 Test',
    lat: 1,
    lng: 2,
    radiusMeters: 100,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    ...overrides,
  };
}

describe('SyncEngine', () => {
  const engine = new SyncEngine(() => NOW, 'web-test');

  it('uses last-writer-wins for conflicting task updates', () => {
    const local = createPayload({ tasks: [createTask({ updatedAt: 10, title: 'Local title' })] });
    const remote = createPayload({ tasks: [createTask({ updatedAt: 20, title: 'Remote title' })] });

    expect(engine.mergePayloads(local, remote).tasks[0]).toMatchObject({
      title: 'Remote title',
      updatedAt: 20,
    });
  });

  it('lets tombstones beat older live rows and newer live rows beat older tombstones', () => {
    const tombstoneWins = engine.mergePayloads(
      createPayload({ tasks: [createTask({ updatedAt: 10 })] }),
      createPayload({ tasks: [createTask({ updatedAt: 20, deletedAt: 20 })] }),
    );
    expect(tombstoneWins.tasks[0].deletedAt).toBe(20);

    const liveWins = engine.mergePayloads(
      createPayload({ tasks: [createTask({ updatedAt: 10, deletedAt: 10 })] }),
      createPayload({ tasks: [createTask({ updatedAt: 20, title: 'Recreated task' })] }),
    );
    expect(liveWins.tasks[0]).toMatchObject({
      title: 'Recreated task',
      deletedAt: null,
    });
  });

  it('does not treat a missing row as a deletion', () => {
    const local = createPayload({ tasks: [createTask({ id: 'task-1', updatedAt: 10 })] });
    const remote = createPayload({ tasks: [] });

    expect(engine.mergePayloads(local, remote).tasks.map(task => task.id)).toEqual(['task-1']);
  });

  it('drops reminders for completed tasks and repairs invalid task references', () => {
    const project = createProject();
    const local = createPayload({
      projects: [project],
      sections: [createSection({ projectId: project.id })],
      tasks: [createTask({
        id: 'child',
        projectId: project.id,
        sectionId: 'missing-section',
        parentTaskId: 'missing-parent',
        updatedAt: 10,
        status: 'COMPLETED',
      })],
      reminders: [createReminder({ updatedAt: 10 })],
    });

    const merged = engine.mergePayloads(local, createPayload());

    expect(merged.tasks[0]).toMatchObject({
      sectionId: null,
      parentTaskId: null,
      updatedAt: NOW,
    });
    expect(merged.reminders).toEqual([]);
  });

  it('tombstones dependent sections and clears task project references when a project is deleted', () => {
    const project = createProject({ updatedAt: 20, deletedAt: 20 });
    const section = createSection({ projectId: project.id, updatedAt: 10 });
    const task = createTask({ projectId: project.id, sectionId: section.id, updatedAt: 10 });

    const merged = engine.mergePayloads(
      createPayload({ projects: [project], sections: [section], tasks: [task] }),
      createPayload(),
    );

    expect(merged.sections[0].deletedAt).not.toBeNull();
    expect(merged.tasks[0]).toMatchObject({
      projectId: null,
      sectionId: null,
    });
  });

  it('drops invalid location reminders but normalizes time reminders with missing locations', () => {
    const task = createTask();
    const merged = engine.mergePayloads(
      createPayload({
        tasks: [task],
        reminders: [
          createReminder({
            id: 'time-reminder',
            type: 'TIME',
            locationId: 'missing',
            locationTriggerType: 'ARRIVE',
          }),
          createReminder({
            id: 'location-reminder',
            type: 'LOCATION',
            locationId: 'missing',
            locationTriggerType: 'ARRIVE',
          }),
        ],
      }),
      createPayload(),
    );

    expect(merged.reminders).toHaveLength(1);
    expect(merged.reminders[0]).toMatchObject({
      id: 'time-reminder',
      locationId: null,
      locationTriggerType: null,
    });
  });

  it('merges locations by updatedAt', () => {
    const local = createPayload({ locations: [createLocation({ updatedAt: 10, label: 'Local' })] });
    const remote = createPayload({ locations: [createLocation({ updatedAt: 20, label: 'Remote' })] });

    expect(engine.mergePayloads(local, remote).locations[0].label).toBe('Remote');
  });

  it('does not duplicate a recurring task after sync when the open successor changes priority', () => {
    const completedLocal = createTask({
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
    const openRemote = createTask({
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
      createPayload({ projects: [createProject()], tasks: [completedLocal] }),
      createPayload({ projects: [createProject()], tasks: [openRemote] }),
    );
    const repaired = repairRecurringTasks(merged);

    const liveTasks = repaired.payload.tasks.filter(task => !task.deletedAt && task.title === 'wifi bill');
    expect(repaired.repairedCount).toBe(0);
    expect(liveTasks).toHaveLength(2);
    expect(liveTasks.filter(task => task.dueAt === new Date('2026-04-09T00:00:00').getTime())).toHaveLength(1);
  });

  it('does not recover a deleted recurring successor after sync merge', () => {
    const completedLocal = createTask({
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
    const deletedRemote = createTask({
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
      createPayload({ projects: [createProject()], tasks: [completedLocal] }),
      createPayload({ projects: [createProject()], tasks: [deletedRemote] }),
    );
    const repaired = repairRecurringTasks(merged);

    const liveTasks = repaired.payload.tasks.filter(task => !task.deletedAt && task.title === 'laundry');
    expect(repaired.repairedCount).toBe(0);
    expect(liveTasks).toHaveLength(1);
    expect(liveTasks[0].status).toBe('COMPLETED');
  });

  it('does not revert a recurring due-date edit after sync merge and repair', () => {
    const completedLocal = createTask({
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
    const dueEditedRemote = createTask({
      id: 'task-recurring-open',
      title: 'cancel Google one Subscription',
      projectId: 'project-1',
      dueAt: new Date('2026-04-14T00:00:00').getTime(),
      allDay: true,
      recurringRule: 'FREQ=DAILY',
      updatedAt: 20,
    });

    const merged = engine.mergePayloads(
      createPayload({ projects: [createProject()], tasks: [completedLocal] }),
      createPayload({ projects: [createProject()], tasks: [dueEditedRemote] }),
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
