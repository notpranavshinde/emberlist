import { beforeEach, describe, expect, it, vi } from 'vitest';

const drive = vi.hoisted(() => ({ download: vi.fn(), upload: vi.fn() }));
vi.mock('./drive.js', () => ({
  downloadSyncPayload: drive.download,
  uploadSyncPayload: drive.upload,
}));

import { createRevisionToken } from './mcp-revision.js';
import { emptyWorkspace } from './mcp-workspace.js';
import { createDriveWorkspaceStore } from './mcp-workspace-store.js';
import { MAX_SYNC_BODY_BYTES } from './sync-payload.js';

const secret = 'a-secret-that-is-at-least-thirty-two-characters';

beforeEach(() => {
  drive.download.mockReset(); drive.upload.mockReset();
});

describe('MCP Drive workspace store', () => {
  it('retries semantic CAS conflicts at most three times without a post-commit read', async () => {
    drive.download.mockResolvedValue({ fileId: 'file', etag: '"etag"', payload: emptyWorkspace() });
    drive.upload
      .mockRejectedValueOnce(conflict())
      .mockRejectedValueOnce(conflict())
      .mockResolvedValueOnce({ id: 'file', version: '2' });
    const store = createDriveWorkspaceStore({ accessToken: 'access', revisionSecret: secret, timeZone: 'UTC' });

    const result = await store.semantic('create_project', { mutationId: 'mutation-project', name: 'Work' });

    expect(result).toMatchObject({ entity: { id: expect.any(String), name: 'Work' },
      revision: expect.any(String), replayed: false });
    expect(drive.upload).toHaveBeenCalledTimes(3);
    expect(drive.download).toHaveBeenCalledTimes(3);
  });

  it('reloads and remerges after a raw merge conflict', async () => {
    const first = emptyWorkspace();
    const second = { ...emptyWorkspace(), projects: [project('remote')] };
    drive.download
      .mockResolvedValueOnce({ fileId: 'file', etag: '"one"', payload: first })
      .mockResolvedValueOnce({ fileId: 'file', etag: '"two"', payload: second });
    drive.upload.mockRejectedValueOnce(conflict()).mockResolvedValueOnce({ id: 'file', version: '2' });
    const store = createDriveWorkspaceStore({ accessToken: 'access', revisionSecret: secret });

    await store.merge({ ...emptyWorkspace(), projects: [project('incoming')] }, 'mutation-merge');

    expect(drive.upload.mock.calls[1][1].projects.map(item => item.id)).toEqual(['incoming', 'remote']);
  });

  it('repairs dangling references during raw merge rather than applying exact-replace strictness', async () => {
    drive.download.mockResolvedValue({ fileId: 'file', etag: '"etag"', payload: emptyWorkspace() });
    drive.upload.mockResolvedValue({ id: 'file', version: '2' });
    const store = createDriveWorkspaceStore({ accessToken: 'access', revisionSecret: secret });
    await store.merge({ ...emptyWorkspace(), tasks: [task({ projectId: 'missing' })] }, 'mutation-repair');
    expect(drive.upload.mock.calls[0][1].tasks[0].projectId).toBeNull();
  });

  it('rejects stale exact replacement without upload or retry', async () => {
    drive.download.mockResolvedValue({ fileId: 'file', etag: '"new"', payload: emptyWorkspace() });
    const store = createDriveWorkspaceStore({ accessToken: 'access', revisionSecret: secret });
    const stale = createRevisionToken('file', '"old"', secret);
    await expect(store.replaceExact(emptyWorkspace(), stale, 'mutation-replace')).rejects.toMatchObject({ statusCode: 409 });
    expect(drive.download).toHaveBeenCalledTimes(1);
    expect(drive.upload).not.toHaveBeenCalled();
  });

  it('rejects oversized raw payloads before Drive access', async () => {
    const store = createDriveWorkspaceStore({ accessToken: 'access', revisionSecret: secret });
    const payload = { ...emptyWorkspace(), tasks: [task({ description: 'x'.repeat(2 * 1024 * 1024) })] };
    await expect(store.merge(payload, 'mutation-large')).rejects.toMatchObject({ statusCode: 413 });
    expect(drive.download).not.toHaveBeenCalled();
  });

  it('returns an atomic replay without executing Drive writes', async () => {
    drive.download.mockResolvedValue({ fileId: 'file', etag: 'version:2',
      payload: { ...emptyWorkspace(), projects: [project('p1')] } });
    const mutationStore = { claim: vi.fn().mockResolvedValue({ replayed: true,
      result: { entityId: 'p1', revision: 'stored-revision' } }),
      complete: vi.fn() };
    const store = createDriveWorkspaceStore({ accessToken: 'access', revisionSecret: secret, mutationStore });
    await expect(store.semantic('create_project', { mutationId: 'mutation-replay', name: 'Work' }))
      .resolves.toMatchObject({ replayed: true, entity: { id: 'p1' } });
    expect(drive.download).toHaveBeenCalledTimes(1);
    expect(mutationStore.complete).not.toHaveBeenCalled();
  });

  it('uses a stable create ID so retries claim the same request hash', async () => {
    drive.download.mockResolvedValue({ fileId: 'file', etag: '"etag"', payload: emptyWorkspace() });
    drive.upload.mockResolvedValue({ id: 'file', version: '2' });
    const mutationStore = {
      claim: vi.fn()
        .mockResolvedValueOnce({ replayed: false })
        .mockResolvedValueOnce({ replayed: true, result: { entityId: 'replayed', revision: 'revision' } }),
      complete: vi.fn(),
    };
    const store = createDriveWorkspaceStore({ accessToken: 'access', revisionSecret: secret, mutationStore,
      authInfo: { extra: { grantId: 'grant' } } });

    const first = await store.semantic('create_project', { mutationId: 'mutation-stable', name: 'Work' });
    await expect(store.semantic('create_project', { mutationId: 'mutation-stable', name: 'Work' }))
      .resolves.toMatchObject({ replayed: true });

    expect(mutationStore.claim.mock.calls[0][1]).toBe(mutationStore.claim.mock.calls[1][1]);
    expect(first.entity.id).toMatch(/^mcp-[0-9a-f]{32}$/u);
    expect(drive.upload).toHaveBeenCalledTimes(1);
  });

  it('does not append or upload a stable create ID that already exists', async () => {
    let current = { fileId: 'file', etag: 'version:1', payload: emptyWorkspace() };
    drive.download.mockImplementation(async () => current);
    drive.upload.mockImplementation(async (_accessToken, payload) => {
      current = { fileId: 'file', etag: 'version:2', payload };
      return { id: 'file', version: '2' };
    });
    const store = createDriveWorkspaceStore({ accessToken: 'access', revisionSecret: secret,
      authInfo: { extra: { grantId: 'grant' } } });
    const args = { mutationId: 'mutation-deduplicated', name: 'Work' };

    const first = await store.semantic('create_project', args);
    const second = await store.semantic('create_project', args);

    expect(second.entity.id).toBe(first.entity.id);
    expect(current.payload.projects.filter(item => item.id === first.entity.id)).toHaveLength(1);
    expect(drive.upload).toHaveBeenCalledTimes(1);
  });

  it('preserves a mutation claim when an upload outcome is uncertain', async () => {
    drive.download.mockResolvedValue({ fileId: 'file', etag: 'version:1', payload: emptyWorkspace() });
    const uncertain = new Error('connection reset'); uncertain.commitUncertain = true;
    drive.upload.mockRejectedValue(uncertain);
    const mutationStore = { claim: vi.fn().mockResolvedValue({ replayed: false }),
      complete: vi.fn(), release: vi.fn() };
    const store = createDriveWorkspaceStore({ accessToken: 'access', revisionSecret: secret, mutationStore });

    await expect(store.semantic('create_project', { mutationId: 'mutation-uncertain', name: 'Work' }))
      .rejects.toBe(uncertain);
    expect(mutationStore.release).not.toHaveBeenCalled();
    expect(mutationStore.complete).not.toHaveBeenCalled();
  });

  it('replays a one-item bulk mutation with an entity array', async () => {
    drive.download.mockResolvedValue({ fileId: 'file', etag: 'version:2', payload: {
      ...emptyWorkspace(), tasks: [task({ id: 't1' })],
    } });
    const mutationStore = { claim: vi.fn().mockResolvedValue({ replayed: true,
      result: { entityIds: ['t1'], revision: 'stored-revision' } }), complete: vi.fn() };
    const store = createDriveWorkspaceStore({ accessToken: 'access', revisionSecret: secret, mutationStore });

    const result = await store.semantic('bulk_update_tasks', {
      mutationId: 'mutation-bulk-replay', taskIds: ['t1'], patch: { priority: 'P1' },
    });

    expect(result).toMatchObject({ entity: [expect.objectContaining({ id: 't1' })], replayed: true });
    expect(Array.isArray(result.entity)).toBe(true);
    expect(drive.upload).not.toHaveBeenCalled();
  });

  it.each([
    ['create_section', { mutationId: 'mutation-section', projectId: 'p1', name: 'Section' }, 'p1'],
    ['create_task', { mutationId: 'mutation-task', projectId: 'p1', title: 'Task' }, 'p1'],
    ['create_reminder', { mutationId: 'mutation-reminder', taskId: 't1', type: 'TIME', timeAt: 2 }, 't1'],
  ])('returns the created entity ID for %s instead of its parent ID', async (operation, args, parentId) => {
    const payload = { ...emptyWorkspace(), projects: [project('p1')], tasks: [task()] };
    drive.download.mockResolvedValue({ fileId: 'file', etag: 'version:1', payload });
    drive.upload.mockResolvedValue({ id: 'file', version: '2' });
    const store = createDriveWorkspaceStore({ accessToken: 'access', revisionSecret: secret });

    const result = await store.semantic(operation, args);

    expect(result.entity.id).not.toBe(parentId);
    expect(result).toMatchObject({ revision: expect.any(String), replayed: false });
  });

  it('rejects a semantic write that would push the generated payload over 2 MiB', async () => {
    const tasks = [];
    let candidate = emptyWorkspace();
    while (Buffer.byteLength(JSON.stringify(candidate), 'utf8') < MAX_SYNC_BODY_BYTES - 50_000) {
      tasks.push(task({ id: `t${tasks.length}`, description: 'x'.repeat(30_000) }));
      candidate = { ...candidate, tasks: [...tasks] };
    }
    expect(Buffer.byteLength(JSON.stringify(candidate), 'utf8')).toBeLessThan(MAX_SYNC_BODY_BYTES);
    drive.download.mockResolvedValue({ fileId: 'file', etag: 'version:1', payload: candidate });
    const store = createDriveWorkspaceStore({ accessToken: 'access', revisionSecret: secret });

    await expect(store.semantic('create_task', { mutationId: 'mutation-overflow', title: 'Overflow',
      description: 'y'.repeat(65_536) })).rejects.toMatchObject({ statusCode: 413 });
    expect(drive.upload).not.toHaveBeenCalled();
  });

  it('does not release an idempotency claim when DB completion fails after Drive commit', async () => {
    drive.download.mockResolvedValue({ fileId: 'file', etag: '"etag"', payload: emptyWorkspace() });
    drive.upload.mockResolvedValue({ id: 'file', version: '2' });
    const mutationStore = { claim: vi.fn().mockResolvedValue({ replayed: false }),
      complete: vi.fn().mockRejectedValue(new Error('database unavailable')), release: vi.fn() };
    const store = createDriveWorkspaceStore({ accessToken: 'access', revisionSecret: secret, mutationStore });
    await expect(store.semantic('create_project', { mutationId: 'mutation-db-failure', name: 'Work' }))
      .rejects.toThrow('database unavailable');
    expect(drive.upload).toHaveBeenCalledTimes(1);
    expect(mutationStore.release).not.toHaveBeenCalled();
  });

  it('uses the grant timezone when a non-date write repairs recurrence across DST', async () => {
    const payload = { ...emptyWorkspace(), tasks: [task({ id: 'done', title: 'Daily', status: 'COMPLETED',
      dueAt: Date.parse('2026-03-07T09:00:00-08:00'), allDay: false, recurringRule: 'FREQ=DAILY',
      completedAt: Date.parse('2026-03-07T10:00:00-08:00') })] };
    drive.download.mockResolvedValue({ fileId: 'file', etag: '"etag"', payload });
    drive.upload.mockResolvedValue({ id: 'file', version: '2' });
    const store = createDriveWorkspaceStore({ accessToken: 'access', revisionSecret: secret,
      timeZone: 'America/Los_Angeles' });
    await store.semantic('create_project', { mutationId: 'mutation-project', name: 'Work' });
    const successor = drive.upload.mock.calls[0][1].tasks.find(item => item.id !== 'done');
    expect(successor.dueAt).toBe(Date.parse('2026-03-08T09:00:00-07:00'));
  });
});

function conflict() { const error = new Error('conflict'); error.code = 'revision_conflict'; return error; }
function project(id) { return { id, name: id, color: '#fff', favorite: false, order: 0, archived: false,
  viewPreference: 'BOARD', createdAt: 1, updatedAt: 1, deletedAt: null }; }
function task(overrides = {}) { return { id: 't1', title: 'Task', description: '', projectId: null, sectionId: null,
  priority: 'P4', dueAt: null, allDay: true, deadlineAt: null, deadlineAllDay: false, recurringRule: null,
  deadlineRecurringRule: null, status: 'OPEN', completedAt: null, parentTaskId: null, locationId: null,
  locationTriggerType: null, order: 0, createdAt: 1, updatedAt: 1, deletedAt: null, ...overrides }; }
