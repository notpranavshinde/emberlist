import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildBackendAuthStartUrl, createCloudSyncService } from './syncService';
import { db } from './db';

describe('backend Drive sync service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('builds a same-origin authorization start URL', () => {
    expect(buildBackendAuthStartUrl('/#/today')).toBe(
      '/api/auth/google/start?returnTo=%2F%23%2Ftoday',
    );
  });

  it('restores a stable account identity from the backend session', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      authenticated: true,
      session: {
        accountId: 'google-sub-1',
        email: 'person@example.com',
        name: 'Person',
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })));

    const service = createCloudSyncService();
    await service.init();

    expect(service.getSession()).toEqual({
      accountId: 'google-sub-1',
      email: 'person@example.com',
      name: 'Person',
    });
    expect(service.hasActiveSession()).toBe(true);
  });

  it('treats an unauthenticated backend response as signed out', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      authenticated: false,
      session: null,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })));

    const service = createCloudSyncService();
    await service.init();

    expect(service.getSession()).toBeNull();
    expect(service.hasActiveSession()).toBe(false);
  });

  it('uses the backend logout endpoint', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const service = createCloudSyncService();
    await service.disconnect();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/google/logout',
      expect.objectContaining({ method: 'POST', credentials: 'same-origin' }),
    );
  });

  it('rejects a different Google account before reading or merging Drive data', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify(
      String(input).includes('/api/auth/session')
        ? {
            authenticated: true,
            session: {
              accountId: 'google-sub-new',
              email: 'new@example.com',
              name: 'New',
            },
          }
        : { fileId: null, payload: null },
    ), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(db, 'getWorkspaceMetadata').mockResolvedValue({
      binding: {
        accountId: 'google-sub-original',
        email: 'original@example.com',
        name: 'Original',
        boundAt: 1,
        initialSyncCompleted: true,
      },
      mutationGeneration: 0,
      uploadedGeneration: 0,
    });

    const service = createCloudSyncService();
    await service.init();

    await expect(service.sync({ interactiveAuth: false }))
      .rejects.toThrow('A different Google account owns this browser cache.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
