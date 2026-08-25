import { describe, expect, it } from 'vitest';
import { downloadSyncPayload, readDriveSyncPayload, uploadSyncPayload } from '../../api/_lib/drive.js';
import { afterEach, vi } from 'vitest';
import { MAX_SYNC_BODY_BYTES } from '../../api/_lib/sync-payload.js';

describe('Drive sync download reader', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('returns a bounded, validated payload', async () => {
    const payload = validPayload();
    await expect(readDriveSyncPayload(new Response(JSON.stringify(payload))))
      .resolves.toEqual(payload);
  });

  it('checks the current Drive version and maps stale revisions to 409', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'file', version: '8', etag: '"etag-8"',
    })));
    vi.stubGlobal('fetch', fetchMock);
    await expect(uploadSyncPayload('access', validPayload(), { fileId: 'file', ifMatch: 'version:7' }))
      .rejects.toMatchObject({ statusCode: 409, code: 'revision_conflict' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses an atomic Drive precondition when another writer changes the file before upload', async () => {
    let competingWriteLanded = false;
    const fetchMock = vi.fn(async (url, init = {}) => {
      if (String(url).includes('/upload/drive/v2/files/file?')) {
        expect(init.headers['If-Match']).toBe('"etag-7"');
        return new Response('', { status: competingWriteLanded ? 412 : 200 });
      }
      if (String(url).includes('/drive/v2/files/file?')) {
        competingWriteLanded = true;
        return new Response(JSON.stringify({ id: 'file', version: '7', etag: '"etag-7"' }));
      }
      throw new Error(`Unexpected Drive request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadSyncPayload('access', validPayload(), {
      fileId: 'file', ifMatch: 'version:7',
    })).rejects.toMatchObject({ statusCode: 409, code: 'revision_conflict' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fails closed when Drive cannot supply an atomic update ETag', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'file', version: '7',
    }))));

    await expect(uploadSyncPayload('access', validPayload(), {
      fileId: 'file', ifMatch: 'version:7',
    })).rejects.toMatchObject({ statusCode: 502, code: 'drive_precondition_unavailable' });
  });

  it('returns the new Drive version after a conditional update', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'file', version: '7', etag: '"etag-7"',
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'file', version: '8' })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadSyncPayload('access', validPayload(), {
      fileId: 'file', ifMatch: 'version:7',
    })).resolves.toEqual({ id: 'file', version: '8' });
    expect(fetchMock.mock.calls[1][0]).toContain('fields=id%2Cversion');
  });

  it('returns the new Drive version after an unconditional PATCH', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'file', version: '8' })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadSyncPayload('access', validPayload(), { fileId: 'file' }))
      .resolves.toEqual({ id: 'file', version: '8' });
    expect(fetchMock.mock.calls[0][0]).toContain('fields=id%2Cversion');
    expect(fetchMock.mock.calls[0][1].method).toBe('PATCH');
  });

  it('returns a committed new workspace without a fallible post-commit visibility read', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'new-file', version: '1' })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadSyncPayload('access', validPayload(), { fileId: null }))
      .resolves.toEqual({ id: 'new-file', version: '1' });
    expect(fetchMock.mock.calls[0][0]).toContain('/upload/drive/v3/files?uploadType=multipart&fields=id%2Cversion');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('marks an interrupted upload as commit-uncertain', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'file', version: '7', etag: '"etag-7"' })))
      .mockRejectedValueOnce(new Error('connection reset'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadSyncPayload('access', validPayload(), { fileId: 'file', ifMatch: 'version:7' }))
      .rejects.toMatchObject({ commitUncertain: true });
  });

  it('reads the workspace version from file metadata before downloading media', async () => {
    const payload = validPayload();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        files: [{ id: 'file', modifiedTime: '2026-08-21T00:00:00Z' }],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'file', version: '7' })))
      .mockResolvedValueOnce(new Response(JSON.stringify(payload)));
    vi.stubGlobal('fetch', fetchMock);

    await expect(downloadSyncPayload('access')).resolves.toEqual({
      fileId: 'file',
      payload,
      etag: 'version:7',
    });
    expect(fetchMock.mock.calls[1][0]).toContain('/drive/v3/files/file?fields=id%2Cversion');
    expect(fetchMock.mock.calls[2][0]).toContain('/drive/v3/files/file?alt=media');
  });

  it('rejects an oversized declared response before buffering', async () => {
    const response = new Response('{}', {
      headers: { 'content-length': String(MAX_SYNC_BODY_BYTES + 1) },
    });
    await expect(readDriveSyncPayload(response)).rejects.toMatchObject({ statusCode: 502 });
  });

  it('rejects malformed and schema-invalid cloud content', async () => {
    await expect(readDriveSyncPayload(new Response('{'))).rejects.toThrow('valid JSON');
    await expect(readDriveSyncPayload(new Response('{}'))).rejects.toMatchObject({ statusCode: 502 });
  });
});

function validPayload() {
  return {
    schemaVersion: 1,
    exportedAt: 1,
    deviceId: 'device',
    payloadId: 'payload',
    source: 'web',
    projects: [],
    sections: [],
    tasks: [],
    reminders: [],
    locations: [],
  };
}
