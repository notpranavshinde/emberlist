import { describe, expect, it } from 'vitest';
import { reconcileLocalPersistPayload } from './localSync';
import { TEST_NOW, createTestPayload, createTestProject, createTestTask } from './testSyncBuilders';

describe('reconcileLocalPersistPayload', () => {
  it('preserves a fresh-tab edit when a stale tab saves a different task', () => {
    const storedPayload = createTestPayload({
      tasks: [
        createTestTask({ id: 'task-fresh', title: 'Fresh title', updatedAt: 100 }),
        createTestTask({ id: 'task-stale', title: 'Original', updatedAt: 10 }),
      ],
    });
    const staleNextPayload = createTestPayload({
      tasks: [
        createTestTask({ id: 'task-fresh', title: 'Old title', updatedAt: 10 }),
        createTestTask({ id: 'task-stale', title: 'Edited in stale tab', updatedAt: 200 }),
      ],
    });

    const reconciled = reconcileLocalPersistPayload(storedPayload, staleNextPayload, () => TEST_NOW);

    expect(reconciled.payload.tasks.find(task => task.id === 'task-fresh')?.title).toBe('Fresh title');
    expect(reconciled.payload.tasks.find(task => task.id === 'task-stale')?.title).toBe('Edited in stale tab');
  });

  it('keeps a newer tombstone when a stale tab saves unrelated work', () => {
    const storedPayload = createTestPayload({
      tasks: [
        createTestTask({ id: 'task-deleted', title: 'Deleted task', updatedAt: 100, deletedAt: 100 }),
        createTestTask({ id: 'task-open', title: 'Still here', updatedAt: 20 }),
      ],
    });
    const staleNextPayload = createTestPayload({
      tasks: [
        createTestTask({ id: 'task-deleted', title: 'Deleted task', updatedAt: 10, deletedAt: null }),
        createTestTask({ id: 'task-open', title: 'Edited elsewhere', updatedAt: 200 }),
      ],
    });

    const reconciled = reconcileLocalPersistPayload(storedPayload, staleNextPayload, () => TEST_NOW);

    expect(reconciled.payload.tasks.find(task => task.id === 'task-deleted')?.deletedAt).toBe(100);
    expect(reconciled.payload.tasks.find(task => task.id === 'task-open')?.title).toBe('Edited elsewhere');
  });

  it('preserves a fresh project move when a stale tab edits another task', () => {
    const oldProject = createTestProject({ id: 'project-old', name: 'Old', updatedAt: 10 });
    const newProject = createTestProject({ id: 'project-new', name: 'New', updatedAt: 20 });
    const storedPayload = createTestPayload({
      projects: [oldProject, newProject],
      tasks: [
        createTestTask({ id: 'task-moved', title: 'Moved', projectId: newProject.id, updatedAt: 100 }),
        createTestTask({ id: 'task-edited', title: 'Original', updatedAt: 10 }),
      ],
    });
    const staleNextPayload = createTestPayload({
      projects: [oldProject, newProject],
      tasks: [
        createTestTask({ id: 'task-moved', title: 'Moved', projectId: oldProject.id, updatedAt: 10 }),
        createTestTask({ id: 'task-edited', title: 'Edited in stale tab', updatedAt: 200 }),
      ],
    });

    const reconciled = reconcileLocalPersistPayload(storedPayload, staleNextPayload, () => TEST_NOW);

    expect(reconciled.payload.tasks.find(task => task.id === 'task-moved')?.projectId).toBe(newProject.id);
    expect(reconciled.payload.tasks.find(task => task.id === 'task-edited')?.title).toBe('Edited in stale tab');
  });

  it('does not recreate a recurring successor when the stored payload already has a renamed continuation', () => {
    const storedPayload = createTestPayload({
      tasks: [
        createTestTask({
          id: 'task-completed',
          title: 'Daily workout',
          dueAt: new Date('2026-04-08T00:00:00Z').getTime(),
          allDay: true,
          recurringRule: 'FREQ=DAILY',
          status: 'COMPLETED',
          completedAt: new Date('2026-04-08T08:00:00Z').getTime(),
          updatedAt: 10,
        }),
        createTestTask({
          id: 'task-open',
          title: 'Morning workout',
          dueAt: new Date('2026-04-09T00:00:00Z').getTime(),
          allDay: true,
          recurringRule: 'FREQ=DAILY',
          updatedAt: 20,
        }),
        createTestTask({ id: 'task-other', title: 'Fresh task', updatedAt: 100 }),
      ],
    });
    const staleNextPayload = createTestPayload({
      tasks: [
        createTestTask({
          id: 'task-completed',
          title: 'Daily workout',
          dueAt: new Date('2026-04-08T00:00:00Z').getTime(),
          allDay: true,
          recurringRule: 'FREQ=DAILY',
          status: 'COMPLETED',
          completedAt: new Date('2026-04-08T08:00:00Z').getTime(),
          updatedAt: 10,
        }),
        createTestTask({ id: 'task-other', title: 'Edited in stale tab', updatedAt: 200 }),
      ],
    });

    const reconciled = reconcileLocalPersistPayload(storedPayload, staleNextPayload, () => TEST_NOW);
    const liveTasks = reconciled.payload.tasks.filter(task => !task.deletedAt);

    expect(reconciled.repairedCount).toBe(0);
    expect(liveTasks.filter(task => task.dueAt === new Date('2026-04-09T00:00:00Z').getTime())).toHaveLength(1);
    expect(liveTasks.find(task => task.id === 'task-other')?.title).toBe('Edited in stale tab');
  });
});
