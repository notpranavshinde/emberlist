import { describe, expect, it } from 'vitest';
import { applyWorkspaceOperation, emptyWorkspace, mergeWorkspaces, validateExactWorkspace } from './mcp-workspace.js';

describe('MCP workspace domain operations', () => {
  it('preserves tombstone and hard-delete boundaries', () => {
    let payload = emptyWorkspace();
    payload = applyWorkspaceOperation(payload, 'create_project', { mutationId: 'mutation-project', id: 'p1', name: 'Work' }, 1);
    payload = applyWorkspaceOperation(payload, 'create_task', { mutationId: 'mutation-task', id: 't1', title: 'Ship', projectId: 'p1' }, 2);
    payload = applyWorkspaceOperation(payload, 'create_reminder', {
      mutationId: 'mutation-reminder', id: 'r1', taskId: 't1', type: 'TIME', offsetMinutes: -10,
    }, 3);
    payload = applyWorkspaceOperation(payload, 'delete_tasks', { mutationId: 'mutation-delete', taskIds: ['t1'] }, 4);

    expect(payload.tasks[0]).toMatchObject({ id: 't1', deletedAt: 4 });
    expect(payload.reminders).toEqual([]);
  });

  it('creates and removes a recurring successor idempotently when completing and reopening', () => {
    let payload = emptyWorkspace();
    payload = applyWorkspaceOperation(payload, 'create_task', {
      mutationId: 'mutation-task', id: 't1', title: 'Daily', dueAt: Date.parse('2026-03-07T09:00:00-07:00'),
      allDay: false, recurringRule: 'FREQ=DAILY',
    }, Date.parse('2026-03-01T00:00:00Z'));
    payload = applyWorkspaceOperation(payload, 'set_task_status', {
      mutationId: 'mutation-done', taskId: 't1', status: 'COMPLETED', timeZone: 'America/Phoenix',
    }, Date.parse('2026-03-07T18:00:00Z'));

    const successor = payload.tasks.find(task => task.id !== 't1');
    expect(successor.status).toBe('OPEN');
    expect(successor.dueAt).toBe(Date.parse('2026-03-08T09:00:00-07:00'));

    payload.tasks.push({ ...successor, id: 'unrelated-later', dueAt: Date.parse('2026-03-09T09:00:00-07:00') });

    payload = applyWorkspaceOperation(payload, 'set_task_status', {
      mutationId: 'mutation-open', taskId: 't1', status: 'OPEN', timeZone: 'America/Phoenix',
    }, Date.parse('2026-03-07T19:00:00Z'));
    expect(payload.tasks.find(task => task.id === successor.id).deletedAt).toBeTruthy();
    expect(payload.tasks.find(task => task.id === 'unrelated-later').deletedAt).toBeNull();
  });

  it('preserves a deleted recurring successor without regenerating the occurrence', () => {
    let payload = emptyWorkspace();
    payload = applyWorkspaceOperation(payload, 'create_task', {
      mutationId: 'mutation-task', id: 't1', title: 'Laundry', dueAt: Date.parse('2026-02-11T00:00:00Z'),
      allDay: true, recurringRule: 'FREQ=DAILY',
    }, Date.parse('2026-02-11T01:00:00Z'));
    payload = applyWorkspaceOperation(payload, 'set_task_status', {
      mutationId: 'mutation-complete', taskId: 't1', status: 'COMPLETED', timeZone: 'UTC',
    }, Date.parse('2026-02-11T08:00:00Z'));
    const successor = payload.tasks.find(task => task.id !== 't1');

    payload = applyWorkspaceOperation(payload, 'delete_tasks', {
      mutationId: 'mutation-delete-successor', taskIds: [successor.id], timeZone: 'UTC',
    }, Date.parse('2026-02-12T07:00:00Z'));

    expect(payload.tasks.find(task => task.id === successor.id).deletedAt)
      .toBe(Date.parse('2026-02-12T07:00:00Z'));
    expect(payload.tasks.filter(task => !task.deletedAt)).toEqual([
      expect.objectContaining({ id: 't1', status: 'COMPLETED' }),
    ]);
  });

  it('tombstones only requested tasks and lets normal repair detach surviving descendants', () => {
    let payload = emptyWorkspace();
    payload = applyWorkspaceOperation(payload, 'create_task', {
      mutationId: 'mutation-root', id: 'root', title: 'Root',
    }, 1);
    payload = applyWorkspaceOperation(payload, 'create_task', {
      mutationId: 'mutation-child', id: 'child', title: 'Child', parentTaskId: 'root',
    }, 2);
    payload = applyWorkspaceOperation(payload, 'create_task', {
      mutationId: 'mutation-grandchild', id: 'grandchild', title: 'Grandchild', parentTaskId: 'child',
    }, 3);
    payload = applyWorkspaceOperation(payload, 'create_reminder', {
      mutationId: 'mutation-reminder', id: 'grandchild-reminder', taskId: 'grandchild',
      type: 'TIME', offsetMinutes: -10,
    }, 4);

    payload = applyWorkspaceOperation(payload, 'delete_tasks', {
      mutationId: 'mutation-delete-tree', taskIds: ['root'],
    }, 5);

    expect(payload.tasks).toEqual([
      expect.objectContaining({ id: 'root', parentTaskId: null, deletedAt: 5 }),
      expect.objectContaining({ id: 'child', parentTaskId: 'root', deletedAt: null }),
      expect.objectContaining({ id: 'grandchild', parentTaskId: 'child', deletedAt: null }),
    ]);
    expect(payload.reminders).toHaveLength(1);

    const repaired = mergeWorkspaces(payload, emptyWorkspace(), 6, 'UTC');
    expect(repaired.tasks.find(task => task.id === 'child')).toMatchObject({ parentTaskId: null, deletedAt: null });
    expect(repaired.tasks.find(task => task.id === 'grandchild')).toMatchObject({ parentTaskId: 'child', deletedAt: null });
  });

  it('clones only enabled reminders and preserves offset versus absolute semantics', () => {
    let payload = emptyWorkspace();
    payload = applyWorkspaceOperation(payload, 'create_task', { mutationId: 'mutation-task', id: 't1', title: 'Daily',
      dueAt: Date.parse('2026-01-01T09:00:00Z'), allDay: false, recurringRule: 'FREQ=DAILY' }, 1);
    payload.reminders = [
      reminder('offset', { offsetMinutes: -15, timeAt: 123 }),
      reminder('absolute', { offsetMinutes: null, timeAt: Date.parse('2026-01-01T08:30:00Z') }),
      reminder('disabled', { offsetMinutes: -5, timeAt: null, enabled: false }),
    ];
    payload = applyWorkspaceOperation(payload, 'set_task_status', { mutationId: 'mutation-done', taskId: 't1',
      status: 'COMPLETED', timeZone: 'UTC' }, Date.parse('2026-01-01T10:00:00Z'));
    const successor = payload.tasks.find(task => task.id !== 't1');
    const cloned = payload.reminders.filter(item => item.taskId === successor.id);
    expect(cloned).toHaveLength(2);
    expect(cloned.find(item => item.offsetMinutes === -15).timeAt).toBeNull();
    expect(cloned.find(item => item.offsetMinutes === null).timeAt).toBe(Date.parse('2026-01-02T08:30:00Z'));
  });

  it('repairs missing recurring successors and duplicate occurrences after merge', () => {
    let source = emptyWorkspace();
    source = applyWorkspaceOperation(source, 'create_task', { mutationId: 'mutation-task', id: 'done', title: 'Daily',
      dueAt: Date.parse('2026-01-01T09:00:00Z'), allDay: false, recurringRule: 'FREQ=DAILY' }, 1);
    source.tasks[0] = { ...source.tasks[0], status: 'COMPLETED', completedAt: Date.parse('2026-01-01T10:00:00Z') };
    const merged = mergeWorkspaces(emptyWorkspace(), source, Date.parse('2026-01-01T11:00:00Z'), 'UTC');
    expect(merged.tasks.filter(task => !task.deletedAt)).toHaveLength(2);

    const duplicate = { ...merged.tasks.find(task => task.status === 'OPEN'), id: 'duplicate', updatedAt: 0 };
    const repaired = mergeWorkspaces(merged, { ...emptyWorkspace(), tasks: [duplicate] }, Date.parse('2026-01-01T12:00:00Z'), 'UTC');
    expect(repaired.tasks.find(task => task.id === 'duplicate').deletedAt).toBeTruthy();
  });

  it('rejects indirect parent cycles and invalid bulk references', () => {
    let payload = emptyWorkspace();
    payload = applyWorkspaceOperation(payload, 'create_task', { mutationId: 'mutation-one', id: 'one', title: 'One' }, 1);
    payload = applyWorkspaceOperation(payload, 'create_task', { mutationId: 'mutation-two', id: 'two', title: 'Two', parentTaskId: 'one' }, 2);
    expect(() => applyWorkspaceOperation(payload, 'update_task', { mutationId: 'mutation-cycle', taskId: 'one',
      patch: { parentTaskId: 'two' } }, 3)).toThrow('cycle');
    expect(() => applyWorkspaceOperation(payload, 'bulk_update_tasks', { mutationId: 'mutation-bulk', taskIds: ['one'],
      patch: { projectId: 'missing' } }, 3)).toThrow('not found');
  });

  it('preserves partial move fields and archives completed occurrences without deleting successors', () => {
    let payload = emptyWorkspace();
    payload = applyWorkspaceOperation(payload, 'create_project', { mutationId: 'mutation-project', id: 'p1', name: 'Work' }, 1);
    payload = applyWorkspaceOperation(payload, 'create_section', { mutationId: 'mutation-section', id: 's1', projectId: 'p1', name: 'Next' }, 2);
    payload = applyWorkspaceOperation(payload, 'create_task', { mutationId: 'mutation-task', id: 't1', title: 'Daily',
      projectId: 'p1', sectionId: 's1', dueAt: Date.parse('2026-01-01T09:00:00Z'), allDay: false,
      recurringRule: 'FREQ=DAILY' }, 3);
    payload = applyWorkspaceOperation(payload, 'move_task', { mutationId: 'mutation-order', taskId: 't1', order: 7 }, 4);
    expect(payload.tasks.find(task => task.id === 't1')).toMatchObject({ projectId: 'p1', sectionId: 's1', order: 7 });
    payload = applyWorkspaceOperation(payload, 'set_task_status', { mutationId: 'mutation-complete', taskId: 't1', status: 'COMPLETED', timeZone: 'UTC' }, Date.parse('2026-01-01T10:00:00Z'));
    const successor = payload.tasks.find(task => task.id !== 't1');
    payload = applyWorkspaceOperation(payload, 'set_task_status', { mutationId: 'mutation-archive', taskId: 't1', status: 'ARCHIVED', timeZone: 'UTC' }, Date.parse('2026-01-01T11:00:00Z'));
    expect(payload.tasks.find(task => task.id === successor.id).deletedAt).toBeNull();
  });

  it('enforces reminder shape and recurrence compatibility', () => {
    let payload = emptyWorkspace();
    payload = applyWorkspaceOperation(payload, 'create_task', { mutationId: 'mutation-task', id: 't1', title: 'Task' }, 1);
    expect(() => applyWorkspaceOperation(payload, 'create_reminder', { mutationId: 'mutation-reminder', taskId: 't1',
      type: 'TIME', timeAt: 1, offsetMinutes: -5 }, 2)).toThrow('exactly one');
    expect(() => applyWorkspaceOperation(payload, 'create_task', { mutationId: 'mutation-unsupported', title: 'Bad',
      dueAt: 1, recurringRule: 'FREQ=DAILY;UNTIL=20270101' }, 2)).toThrow('unsupported');
    expect(() => applyWorkspaceOperation(payload, 'create_task', { mutationId: 'mutation-duplicate', title: 'Bad',
      dueAt: 1, recurringRule: 'FREQ=DAILY;FREQ=WEEKLY' }, 2)).toThrow('repeats');
    expect(() => applyWorkspaceOperation(payload, 'create_task', { mutationId: 'mutation-large-interval', title: 'Valid',
      dueAt: 1, recurringRule: 'FREQ=DAILY;INTERVAL=999999' }, 2)).not.toThrow();
  });

  it('completes archived direct subtasks with their parent', () => {
    let payload = emptyWorkspace();
    payload = applyWorkspaceOperation(payload, 'create_task', { mutationId: 'mutation-parent', id: 'parent', title: 'Parent' }, 1);
    payload = applyWorkspaceOperation(payload, 'create_task', { mutationId: 'mutation-child', id: 'child', title: 'Child',
      parentTaskId: 'parent' }, 2);
    payload = applyWorkspaceOperation(payload, 'set_task_status', { mutationId: 'mutation-archive', taskId: 'child',
      status: 'ARCHIVED' }, 3);
    payload = applyWorkspaceOperation(payload, 'set_task_status', { mutationId: 'mutation-complete', taskId: 'parent',
      status: 'COMPLETED' }, 4);
    expect(payload.tasks.find(task => task.id === 'child')).toMatchObject({ status: 'COMPLETED', completedAt: 4 });
  });

  it('repairs references on merge but rejects them for exact replacement', () => {
    const invalid = { ...emptyWorkspace(), tasks: [{
      id: 't1', title: 'Lost', description: '', projectId: 'missing', sectionId: null, priority: 'P4',
      dueAt: null, allDay: true, deadlineAt: null, deadlineAllDay: false, recurringRule: null,
      deadlineRecurringRule: null, status: 'OPEN', completedAt: null, parentTaskId: null, locationId: null,
      locationTriggerType: null, order: 0, createdAt: 1, updatedAt: 1, deletedAt: null,
    }] };
    expect(() => validateExactWorkspace(invalid)).toThrow('missing project');
    expect(mergeWorkspaces(emptyWorkspace(), invalid, 5).tasks[0].projectId).toBeNull();
  });

  it('rejects duplicate entity IDs for exact replacement', () => {
    const project = { id: 'p1', name: 'Work', color: '#fff', favorite: false, order: 0, archived: false,
      viewPreference: 'BOARD', createdAt: 1, updatedAt: 1, deletedAt: null };
    expect(() => validateExactWorkspace({ ...emptyWorkspace(), projects: [project, { ...project, name: 'Other' }] }))
      .toThrow('duplicate IDs');
  });
});

function reminder(id, overrides) {
  return { id, taskId: 't1', type: 'TIME', timeAt: null, offsetMinutes: null, locationId: null,
    locationTriggerType: null, enabled: true, ephemeral: false, createdAt: 1, updatedAt: 1, deletedAt: null,
    ...overrides };
}
