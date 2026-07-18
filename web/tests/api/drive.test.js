import { describe, expect, it } from 'vitest';
import { readDriveSyncPayload } from '../../api/_lib/drive.js';
import { MAX_SYNC_BODY_BYTES } from '../../api/_lib/sync-payload.js';

describe('Drive sync download reader', () => {
  it('returns a bounded, validated payload', async () => {
    const payload = validPayload();
    await expect(readDriveSyncPayload(new Response(JSON.stringify(payload))))
      .resolves.toEqual(payload);
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
