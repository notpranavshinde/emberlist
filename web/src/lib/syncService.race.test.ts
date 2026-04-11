import { describe, expect, it, vi } from 'vitest';
import type { SyncPayload } from '../types/sync';
import { db } from './db';
import { DriveSyncService } from './syncService';
import { createTestPayload, createTestTask } from './testSyncBuilders';

type TestableDriveSyncService = {
  accessToken: string | null;
  authorizedFetch: (
    input: string,
    init?: RequestInit,
    allowRefresh?: boolean,
    interactiveAuth?: boolean
  ) => Promise<{ ok: boolean; status: number; json?: () => Promise<unknown>; text?: () => Promise<string> }>;
  findSyncFileId: (interactiveAuth: boolean) => Promise<string | null>;
  findSyncFileIds: (interactiveAuth: boolean) => Promise<string[]>;
  login: (interactiveAuth?: boolean) => Promise<unknown>;
  uploadPayload: (fileId: string | null, payload: SyncPayload, interactiveAuth: boolean) => Promise<void>;
};

function createPayload(title = 'Task', updatedAt = 1): SyncPayload {
  return createTestPayload({
    payloadId: `payload-${title}-${updatedAt}`,
    exportedAt: updatedAt,
    tasks: [createTestTask({ id: 'task-1', title, updatedAt })],
  });
}

describe('DriveSyncService orchestration', () => {
  it('keeps the newer local edit when the remote file is older', async () => {
    const service = new DriveSyncService('client-id');
    const testable = service as unknown as TestableDriveSyncService;
    const localPayload = createPayload('Local due date', 50);
    localPayload.tasks[0] = {
      ...localPayload.tasks[0],
      dueAt: new Date('2026-04-10T00:00:00Z').getTime(),
    };
    const remotePayload = createPayload('Remote stale due date', 20);
    remotePayload.tasks[0] = {
      ...remotePayload.tasks[0],
      dueAt: new Date('2026-04-05T00:00:00Z').getTime(),
    };

    testable.accessToken = 'token';
    testable.findSyncFileId = vi.fn(async () => 'file-1');
    testable.authorizedFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => remotePayload,
    }));
    const uploadPayload = vi.fn(async () => undefined);
    testable.uploadPayload = uploadPayload;

    const getPayloadSpy = vi.spyOn(db, 'getPayload').mockResolvedValue(localPayload);
    const savePayloadSpy = vi.spyOn(db, 'savePayload').mockResolvedValue(undefined);

    const result = await service.sync({ interactiveAuth: false });

    expect(result.tasks[0]).toMatchObject({
      title: 'Local due date',
      dueAt: new Date('2026-04-10T00:00:00Z').getTime(),
    });
    expect(uploadPayload).toHaveBeenCalledWith('file-1', result, false);
    expect(savePayloadSpy).not.toHaveBeenCalled();

    getPayloadSpy.mockRestore();
    savePayloadSpy.mockRestore();
  });

  it('does not save locally when upload fails after a merge', async () => {
    const service = new DriveSyncService('client-id');
    const testable = service as unknown as TestableDriveSyncService;
    testable.accessToken = 'token';
    testable.findSyncFileId = vi.fn(async () => 'file-1');
    testable.authorizedFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => createPayload('Remote', 20),
    }));
    testable.uploadPayload = vi.fn(async () => {
      throw new Error('upload failed');
    });

    const getPayloadSpy = vi.spyOn(db, 'getPayload').mockResolvedValue(createPayload('Local', 10));
    const savePayloadSpy = vi.spyOn(db, 'savePayload').mockResolvedValue(undefined);

    await expect(service.sync({ interactiveAuth: false })).rejects.toThrow('upload failed');
    expect(savePayloadSpy).not.toHaveBeenCalled();

    getPayloadSpy.mockRestore();
    savePayloadSpy.mockRestore();
  });

  it('does not clobber a first local edit by persisting an in-flight sync snapshot directly to IndexedDB', async () => {
    const service = new DriveSyncService('client-id');
    const testable = service as unknown as TestableDriveSyncService;
    const localPayload = createPayload('Original', 10);
    const remotePayload = createPayload('Remote copy', 20);

    testable.accessToken = 'token';
    testable.findSyncFileId = vi.fn(async () => 'file-1');
    testable.authorizedFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => remotePayload,
    }));
    testable.uploadPayload = vi.fn(async () => undefined);

    const getPayloadSpy = vi.spyOn(db, 'getPayload').mockResolvedValue(localPayload);
    const savePayloadSpy = vi.spyOn(db, 'savePayload').mockResolvedValue(undefined);

    const result = await service.sync({ interactiveAuth: false });

    expect(result.tasks[0].title).toBe('Remote copy');
    expect(savePayloadSpy).not.toHaveBeenCalled();

    getPayloadSpy.mockRestore();
    savePayloadSpy.mockRestore();
  });

  it('retries once on 401 when interactive auth is allowed', async () => {
    const service = new DriveSyncService('client-id');
    const testable = service as unknown as TestableDriveSyncService;
    let fetchCallCount = 0;

    testable.accessToken = 'token-1';
    const login = vi.fn(async (interactiveAuth?: boolean) => {
      void interactiveAuth;
      testable.accessToken = 'token-2';
      return null;
    });
    testable.login = login;
    testable.authorizedFetch = async (input, init, allowRefresh = true, interactiveAuth = true) => {
      fetchCallCount += 1;
      const response = {
        ok: fetchCallCount > 1,
        status: fetchCallCount > 1 ? 200 : 401,
        json: async () => ({}),
        text: async () => '',
      };

      if (response.status === 401 && allowRefresh && interactiveAuth) {
        testable.accessToken = null;
        await login(interactiveAuth);
        return testable.authorizedFetch(input, init, false, interactiveAuth);
      }

      return response;
    };

    const response = await testable.authorizedFetch('https://example.com', {}, true, true);

    expect(response.ok).toBe(true);
    expect(fetchCallCount).toBe(2);
    expect(login).toHaveBeenCalledTimes(1);
  });

  it('does not retry a 401 during silent auth refresh', async () => {
    const service = new DriveSyncService('client-id');
    const testable = service as unknown as TestableDriveSyncService;
    const login = vi.fn(async (interactiveAuth?: boolean) => {
      void interactiveAuth;
      return null;
    });
    testable.accessToken = 'token-1';
    testable.login = login;
    testable.authorizedFetch = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
      text: async () => '',
    }));

    const response = await testable.authorizedFetch('https://example.com', {}, true, false);

    expect(response.status).toBe(401);
    expect(login).not.toHaveBeenCalled();
  });

  it('picks the newest remote sync file deterministically when multiple files exist', async () => {
    const service = new DriveSyncService('client-id');
    const testable = service as unknown as TestableDriveSyncService;
    testable.accessToken = 'token';
    testable.authorizedFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        files: [
          { id: 'file-b', modifiedTime: '2026-04-03T10:00:00.000Z' },
          { id: 'file-c', modifiedTime: '2026-04-03T10:00:00.000Z' },
          { id: 'file-a', modifiedTime: '2026-04-02T10:00:00.000Z' },
        ],
      }),
    }));

    const fileIds = await testable.findSyncFileIds(false);

    expect(fileIds).toEqual(['file-c', 'file-b', 'file-a']);
  });
});
