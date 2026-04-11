import { describe, expect, it, vi } from 'vitest';
import type { SyncPayload } from '../types/sync';
import { createEmptySyncPayload } from './syncPayload';
import { db } from './db';
import { DriveSyncService, GOOGLE_AUTH_TIMEOUT_MS, resolveGoogleAuthPrompt, resolveGoogleLoginHint } from './syncService';

type TestableDriveSyncService = {
  performSync: (options?: { interactiveAuth?: boolean }) => Promise<SyncPayload>;
  accessToken: string | null;
  findSyncFileId: (interactiveAuth: boolean) => Promise<string | null>;
  authorizedFetch: (
    input: string,
    init?: RequestInit,
    allowRefresh?: boolean,
    interactiveAuth?: boolean
  ) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
  uploadPayload: (fileId: string | null, payload: SyncPayload, interactiveAuth: boolean) => Promise<void>;
};

function createPayload(title: string = 'Local'): SyncPayload {
  const payload = createEmptySyncPayload('device-1');
  payload.payloadId = 'payload-1';
  payload.exportedAt = 100;
  payload.tasks = [{
    id: 'task-1',
    title,
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
  }];
  return payload;
}

describe('resolveGoogleAuthPrompt', () => {
  it('uses consent for the first interactive sign-in', () => {
    expect(resolveGoogleAuthPrompt(true, false)).toBe('consent');
  });

  it('uses silent auth for reload-time restoration without an in-memory token', () => {
    expect(resolveGoogleAuthPrompt(false, false)).toBe('');
  });

  it('uses silent auth when a token is already present', () => {
    expect(resolveGoogleAuthPrompt(true, true)).toBe('');
    expect(resolveGoogleAuthPrompt(false, true)).toBe('');
  });
});

describe('resolveGoogleLoginHint', () => {
  it('returns undefined for blank stored emails and a trimmed email otherwise', () => {
    expect(resolveGoogleLoginHint(null)).toBeUndefined();
    expect(resolveGoogleLoginHint('   ')).toBeUndefined();
    expect(resolveGoogleLoginHint('  pranav@example.com  ')).toBe('pranav@example.com');
  });
});

describe('DriveSyncService', () => {
  it('uploads the local payload when no remote sync file exists', async () => {
    const service = new DriveSyncService('client-id');
    const testableService = service as unknown as TestableDriveSyncService;
    const localPayload = createPayload('Local');
    testableService.accessToken = 'token';
    testableService.findSyncFileId = vi.fn(async () => null);
    testableService.authorizedFetch = vi.fn();
    const uploadPayload = vi.fn(async () => undefined);
    testableService.uploadPayload = uploadPayload;
    const getPayloadSpy = vi.spyOn(db, 'getPayload').mockResolvedValue(localPayload);
    const savePayloadSpy = vi.spyOn(db, 'savePayload').mockResolvedValue(undefined);

    const result = await service.sync({ interactiveAuth: false });

    expect(result).toBe(localPayload);
    expect(uploadPayload).toHaveBeenCalledWith(null, localPayload, false);
    expect(savePayloadSpy).not.toHaveBeenCalled();

    getPayloadSpy.mockRestore();
    savePayloadSpy.mockRestore();
  });

  it('merges an existing remote payload without bypassing app-level local reconciliation', async () => {
    const service = new DriveSyncService('client-id');
    const testableService = service as unknown as TestableDriveSyncService;
    const localPayload = createPayload('Local');
    const remotePayload = createPayload('Remote');
    remotePayload.tasks[0] = { ...remotePayload.tasks[0], updatedAt: 20 };
    testableService.accessToken = 'token';
    testableService.findSyncFileId = vi.fn(async () => 'file-1');
    testableService.authorizedFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => remotePayload,
    }));
    const uploadPayload = vi.fn(async () => undefined);
    testableService.uploadPayload = uploadPayload;
    const getPayloadSpy = vi.spyOn(db, 'getPayload').mockResolvedValue(localPayload);
    const savePayloadSpy = vi.spyOn(db, 'savePayload').mockResolvedValue(undefined);

    const result = await service.sync({ interactiveAuth: false });

    expect(result.tasks[0].title).toBe('Remote');
    expect(uploadPayload).toHaveBeenCalledWith('file-1', result, false);
    expect(savePayloadSpy).not.toHaveBeenCalled();

    getPayloadSpy.mockRestore();
    savePayloadSpy.mockRestore();
  });

  it('deduplicates overlapping sync calls', async () => {
    const service = new DriveSyncService('client-id');
    const testableService = service as unknown as TestableDriveSyncService;
    const payload = createPayload();
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const performSync = vi.fn(async () => {
      await gate;
      return payload;
    });
    testableService.performSync = performSync;

    const first = service.sync();
    const second = service.sync();

    expect(performSync).toHaveBeenCalledTimes(1);
    release();

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult).toBe(payload);
    expect(secondResult).toBe(payload);
  });

  it('fails clearly when the remote payload uses a newer schema version', async () => {
    const service = new DriveSyncService('client-id');
    const testableService = service as unknown as TestableDriveSyncService;
    const remotePayload = createPayload('Remote');
    remotePayload.schemaVersion = 999;
    testableService.accessToken = 'token';
    testableService.findSyncFileId = vi.fn(async () => 'file-1');
    testableService.authorizedFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => remotePayload,
    }));
    testableService.uploadPayload = vi.fn();
    const getPayloadSpy = vi.spyOn(db, 'getPayload').mockResolvedValue(createPayload('Local'));
    const savePayloadSpy = vi.spyOn(db, 'savePayload').mockResolvedValue(undefined);

    await expect(service.sync({ interactiveAuth: false })).rejects.toThrow('Cloud sync file is from a newer app version.');

    getPayloadSpy.mockRestore();
    savePayloadSpy.mockRestore();
  });

  it('does not overwrite local IndexedDB state while an app-level reconcile is still pending', async () => {
    const service = new DriveSyncService('client-id');
    const testableService = service as unknown as TestableDriveSyncService;
    const localPayload = createPayload('Local before first edit');
    const remotePayload = createPayload('Remote before first edit');
    testableService.accessToken = 'token';
    testableService.findSyncFileId = vi.fn(async () => 'file-1');
    testableService.authorizedFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => remotePayload,
    }));
    const uploadPayload = vi.fn(async () => undefined);
    testableService.uploadPayload = uploadPayload;
    const getPayloadSpy = vi.spyOn(db, 'getPayload').mockResolvedValue(localPayload);
    const savePayloadSpy = vi.spyOn(db, 'savePayload').mockResolvedValue(undefined);

    const result = await service.sync({ interactiveAuth: false });

    expect(result.tasks[0].title).toBe('Remote before first edit');
    expect(uploadPayload).toHaveBeenCalledWith('file-1', result, false);
    expect(savePayloadSpy).not.toHaveBeenCalled();

    getPayloadSpy.mockRestore();
    savePayloadSpy.mockRestore();
  });

  it('fails safely on malformed remote payloads without saving local changes', async () => {
    const service = new DriveSyncService('client-id');
    const testableService = service as unknown as TestableDriveSyncService;
    testableService.accessToken = 'token';
    testableService.findSyncFileId = vi.fn(async () => 'file-1');
    testableService.authorizedFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ bad: 'payload' }),
    }));
    testableService.uploadPayload = vi.fn(async () => undefined);
    const getPayloadSpy = vi.spyOn(db, 'getPayload').mockResolvedValue(createPayload('Local'));
    const savePayloadSpy = vi.spyOn(db, 'savePayload').mockResolvedValue(undefined);

    await expect(service.sync({ interactiveAuth: false })).rejects.toThrow(
      'Cloud sync file is invalid or corrupted. Local web data was not changed. Reset cloud sync and sync again to recreate it.',
    );
    expect(savePayloadSpy).not.toHaveBeenCalled();

    getPayloadSpy.mockRestore();
    savePayloadSpy.mockRestore();
  });

  it('resetRemoteSyncFile deletes every matching cloud file', async () => {
    const service = new DriveSyncService('client-id');
    (service as unknown as { accessToken: string | null }).accessToken = 'token';
    const deleteCalls: string[] = [];
    const findSyncFileIds = vi.fn(async () => ['file-1', 'file-2']);
    const authorizedFetch = vi.fn(async (url: string) => {
      deleteCalls.push(url.split('/').pop() ?? '');
      return { ok: true, status: 204, text: async () => '' };
    });
    (service as unknown as {
      findSyncFileIds: (interactiveAuth: boolean) => Promise<string[]>;
      authorizedFetch: (input: string, init?: RequestInit, allowRefresh?: boolean, interactiveAuth?: boolean) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;
    }).findSyncFileIds = findSyncFileIds;
    (service as unknown as {
      findSyncFileIds: (interactiveAuth: boolean) => Promise<string[]>;
      authorizedFetch: (input: string, init?: RequestInit, allowRefresh?: boolean, interactiveAuth?: boolean) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;
    }).authorizedFetch = authorizedFetch;

    await service.resetRemoteSyncFile();

    expect(findSyncFileIds).toHaveBeenCalledWith(true);
    expect(deleteCalls).toEqual(['file-1', 'file-2']);
  });

  it('passes the stored account email as a login hint during token requests', async () => {
    const service = new DriveSyncService('client-id');
    const requestAccessToken = vi.fn(async () => 'token');
    const fetchSessionProfile = vi.fn(async () => ({ email: 'pranav@example.com', name: 'Pranav' }));

    (service as unknown as {
      tokenClient: object;
      requestAccessToken: (prompt: '' | 'consent', loginHint?: string) => Promise<string>;
      fetchSessionProfile: (interactiveAuth: boolean) => Promise<{ email: string; name: string }>;
    }).tokenClient = {};
    (service as unknown as {
      tokenClient: object;
      requestAccessToken: (prompt: '' | 'consent', loginHint?: string) => Promise<string>;
      fetchSessionProfile: (interactiveAuth: boolean) => Promise<{ email: string; name: string }>;
    }).requestAccessToken = requestAccessToken;
    (service as unknown as {
      tokenClient: object;
      requestAccessToken: (prompt: '' | 'consent', loginHint?: string) => Promise<string>;
      fetchSessionProfile: (interactiveAuth: boolean) => Promise<{ email: string; name: string }>;
    }).fetchSessionProfile = fetchSessionProfile;

    service.setPreferredLoginHint('pranav@example.com');
    await service.login(false);

    expect(requestAccessToken).toHaveBeenCalledWith('', 'pranav@example.com');
    expect(fetchSessionProfile).toHaveBeenCalledWith(false);
  });

  it('keeps first-run Google sign-in open for the full auth timeout window', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('window', globalThis);
    const service = new DriveSyncService('client-id');
    const tokenClient = {
      callback: undefined as ((response: { access_token?: string; error?: string }) => void) | undefined,
      error_callback: undefined as ((error: { type: string }) => void) | undefined,
      requestAccessToken: vi.fn(),
    };

    (service as unknown as {
      tokenClient: typeof tokenClient;
      requestAccessToken: (prompt: '' | 'consent', loginHint?: string) => Promise<string>;
    }).tokenClient = tokenClient;

    let settled = false;
    const requestPromise = (service as unknown as {
      tokenClient: typeof tokenClient;
      requestAccessToken: (prompt: '' | 'consent', loginHint?: string) => Promise<string>;
    }).requestAccessToken('consent').finally(() => {
      settled = true;
    });
    const handledRequestPromise = requestPromise.catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(GOOGLE_AUTH_TIMEOUT_MS - 1);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const error = await handledRequestPromise;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Google sign-in timed out.');

    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
});
