import { describe, expect, it } from 'vitest';
import type { SyncPayload, Task } from '../types/sync';
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

const engine = new SyncEngine(() => TEST_NOW, 'web-test');

function mergeTask(localTask: Task, remoteTask: Task): SyncPayload {
  return engine.mergePayloads(
    createTestPayload({ tasks: [localTask] }),
    createTestPayload({ tasks: [remoteTask] }),
  );
}

describe('SyncEngine conflict matrix', () => {
  it.each([
    {
      name: 'title',
      local: { title: 'Local title', updatedAt: 30 },
      remote: { title: 'Remote title', updatedAt: 40 },
      expectField: (task: Task) => task.title,
      expected: 'Remote title',
    },
    {
      name: 'description',
      local: { description: 'Local description', updatedAt: 30 },
      remote: { description: 'Remote description', updatedAt: 40 },
      expectField: (task: Task) => task.description,
      expected: 'Remote description',
    },
    {
      name: 'priority',
      local: { priority: 'P4' as const, updatedAt: 30 },
      remote: { priority: 'P1' as const, updatedAt: 40 },
      expectField: (task: Task) => task.priority,
      expected: 'P1',
    },
    {
      name: 'due date',
      local: { dueAt: new Date('2026-04-05T00:00:00Z').getTime(), updatedAt: 30 },
      remote: { dueAt: new Date('2026-04-10T00:00:00Z').getTime(), updatedAt: 40 },
      expectField: (task: Task) => task.dueAt,
      expected: new Date('2026-04-10T00:00:00Z').getTime(),
    },
    {
      name: 'deadline',
      local: { deadlineAt: new Date('2026-04-07T00:00:00Z').getTime(), updatedAt: 30 },
      remote: { deadlineAt: new Date('2026-04-11T00:00:00Z').getTime(), updatedAt: 40 },
      expectField: (task: Task) => task.deadlineAt ?? null,
      expected: new Date('2026-04-11T00:00:00Z').getTime(),
    },
  ])('keeps the newer $name edit', ({ local, remote, expectField, expected }) => {
    const localTask = createTestTask({ ...local, id: 'task-1' });
    const remoteTask = createTestTask({ ...remote, id: 'task-1' });

    const merged = mergeTask(localTask, remoteTask);

    expect(expectField(merged.tasks[0])).toEqual(expected);
  });

  it('is idempotent when the merged payload is merged again with either side', () => {
    const local = createTestPayload({
      projects: [createTestProject({ id: 'project-1', updatedAt: 10 })],
      tasks: [createTestTask({ id: 'task-1', title: 'Local title', updatedAt: 30 })],
      reminders: [createTestReminder({ id: 'reminder-1', updatedAt: 30 })],
    });
    const remote = createTestPayload({
      projects: [createTestProject({ id: 'project-1', archived: true, updatedAt: 20 })],
      tasks: [createTestTask({ id: 'task-1', title: 'Remote title', updatedAt: 40 })],
      reminders: [createTestReminder({ id: 'reminder-1', timeAt: 100, updatedAt: 20 })],
    });

    const merged = engine.mergePayloads(local, remote);

    const mergedWithLocal = engine.mergePayloads(merged, local);
    const mergedWithRemote = engine.mergePayloads(remote, merged);

    expect(mergedWithLocal.projects).toEqual(merged.projects);
    expect(mergedWithLocal.tasks).toEqual(merged.tasks);
    expect(mergedWithLocal.reminders).toEqual(merged.reminders);
    expect(mergedWithRemote.projects).toEqual(merged.projects);
    expect(mergedWithRemote.tasks).toEqual(merged.tasks);
    expect(mergedWithRemote.reminders).toEqual(merged.reminders);
  });

  it('stays deterministic when equal timestamps conflict and merge order flips', () => {
    const left = createTestPayload({
      tasks: [createTestTask({ id: 'task-1', title: 'Alpha', updatedAt: 30 })],
    });
    const right = createTestPayload({
      tasks: [createTestTask({ id: 'task-1', title: 'Zulu', updatedAt: 30 })],
    });

    const forward = engine.mergePayloads(left, right);
    const reverse = engine.mergePayloads(right, left);

    expect(forward.tasks[0]).toEqual(reverse.tasks[0]);
    expect(forward.tasks[0].title).toBe('Zulu');
  });

  it('normalizes a newer task move into a deleted project and mismatched section', () => {
    const deletedProject = createTestProject({ id: 'project-deleted', updatedAt: 50, deletedAt: 50 });
    const liveProject = createTestProject({ id: 'project-live', updatedAt: 10 });
    const deletedSection = createTestSection({ id: 'section-1', projectId: 'project-deleted', updatedAt: 10 });

    const merged = engine.mergePayloads(
      createTestPayload({
        projects: [liveProject],
        tasks: [createTestTask({ id: 'task-1', projectId: 'project-live', sectionId: null, updatedAt: 10 })],
      }),
      createTestPayload({
        projects: [deletedProject],
        sections: [deletedSection],
        tasks: [createTestTask({ id: 'task-1', projectId: 'project-deleted', sectionId: 'section-1', updatedAt: 60 })],
      }),
    );

    expect(merged.tasks[0]).toMatchObject({
      projectId: null,
      sectionId: null,
      updatedAt: TEST_NOW,
    });
  });

  it('keeps a newer project move when the destination project exists', () => {
    const localProject = createTestProject({ id: 'project-old', name: 'Old' });
    const remoteProject = createTestProject({ id: 'project-new', name: 'New' });

    const merged = engine.mergePayloads(
      createTestPayload({
        projects: [localProject, remoteProject],
        tasks: [createTestTask({ id: 'task-1', projectId: localProject.id, updatedAt: 10 })],
      }),
      createTestPayload({
        projects: [localProject, remoteProject],
        tasks: [createTestTask({ id: 'task-1', projectId: remoteProject.id, updatedAt: 20 })],
      }),
    );

    expect(merged.tasks[0].projectId).toBe(remoteProject.id);
  });

  it('keeps a newer section move when the destination section exists under the same project', () => {
    const project = createTestProject({ id: 'project-1' });
    const oldSection = createTestSection({ id: 'section-old', projectId: project.id });
    const newSection = createTestSection({ id: 'section-new', projectId: project.id, name: 'New section' });

    const merged = engine.mergePayloads(
      createTestPayload({
        projects: [project],
        sections: [oldSection, newSection],
        tasks: [createTestTask({ id: 'task-1', projectId: project.id, sectionId: oldSection.id, updatedAt: 10 })],
      }),
      createTestPayload({
        projects: [project],
        sections: [oldSection, newSection],
        tasks: [createTestTask({ id: 'task-1', projectId: project.id, sectionId: newSection.id, updatedAt: 20 })],
      }),
    );

    expect(merged.tasks[0].sectionId).toBe(newSection.id);
  });

  it('keeps a newer parent assignment when the parent task exists', () => {
    const parent = createTestTask({ id: 'parent-1', updatedAt: 5 });

    const merged = engine.mergePayloads(
      createTestPayload({
        tasks: [parent, createTestTask({ id: 'task-1', parentTaskId: null, updatedAt: 10 })],
      }),
      createTestPayload({
        tasks: [parent, createTestTask({ id: 'task-1', parentTaskId: parent.id, updatedAt: 20 })],
      }),
    );

    expect(merged.tasks.find(task => task.id === 'task-1')?.parentTaskId).toBe(parent.id);
  });

  it('keeps a newer location assignment when the location exists', () => {
    const location = createTestLocation({ id: 'location-1' });

    const merged = engine.mergePayloads(
      createTestPayload({
        locations: [location],
        tasks: [createTestTask({ id: 'task-1', locationId: null, locationTriggerType: null, updatedAt: 10 })],
      }),
      createTestPayload({
        locations: [location],
        tasks: [createTestTask({ id: 'task-1', locationId: location.id, locationTriggerType: 'ARRIVE', updatedAt: 20 })],
      }),
    );

    expect(merged.tasks[0]).toMatchObject({
      locationId: location.id,
      locationTriggerType: 'ARRIVE',
    });
  });

  it('clears section references when a section is deleted but the project stays live', () => {
    const project = createTestProject({ id: 'project-1' });
    const section = createTestSection({ id: 'section-1', projectId: project.id, updatedAt: 50, deletedAt: 50 });
    const task = createTestTask({ id: 'task-1', projectId: project.id, sectionId: section.id, updatedAt: 40 });

    const merged = engine.mergePayloads(
      createTestPayload({ projects: [project], tasks: [task] }),
      createTestPayload({ projects: [project], sections: [section], tasks: [task] }),
    );

    expect(merged.tasks[0]).toMatchObject({
      projectId: project.id,
      sectionId: null,
      updatedAt: TEST_NOW,
    });
  });

  it('clears parent references when a parent task loses the merge', () => {
    const child = createTestTask({ id: 'child', parentTaskId: 'parent', updatedAt: 20 });
    const deletedParent = createTestTask({ id: 'parent', updatedAt: 30, deletedAt: 30 });

    const merged = engine.mergePayloads(
      createTestPayload({ tasks: [child] }),
      createTestPayload({ tasks: [deletedParent] }),
    );

    expect(merged.tasks.find(task => task.id === 'child')).toMatchObject({
      parentTaskId: null,
      updatedAt: TEST_NOW,
    });
  });

  it('keeps the newer reminder variant before task-status repair drops or normalizes it', () => {
    const task = createTestTask({ id: 'task-1', status: 'OPEN' });
    const local = createTestPayload({
      tasks: [task],
      locations: [createTestLocation({ id: 'location-1' })],
      reminders: [createTestReminder({
        id: 'reminder-1',
        taskId: task.id,
        type: 'TIME',
        timeAt: 100,
        offsetMinutes: null,
        updatedAt: 10,
      })],
    });
    const remote = createTestPayload({
      tasks: [task],
      reminders: [createTestReminder({
        id: 'reminder-1',
        taskId: task.id,
        type: 'TIME',
        timeAt: null,
        offsetMinutes: 15,
        locationId: 'missing-location',
        locationTriggerType: 'ARRIVE',
        updatedAt: 20,
      })],
    });

    const merged = engine.mergePayloads(local, remote);

    expect(merged.reminders[0]).toMatchObject({
      id: 'reminder-1',
      timeAt: null,
      offsetMinutes: 15,
      locationId: null,
      locationTriggerType: null,
    });
  });
});
