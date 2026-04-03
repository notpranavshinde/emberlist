import { describe, expect, it } from 'vitest';
import { assertSupportedSyncPayload, createEmptySyncPayload, normalizeImportedPayload } from './syncPayload';

describe('syncPayload', () => {
  it('serializes default sync payload fields', () => {
    const payload = createEmptySyncPayload('device-1');
    payload.exportedAt = 123;
    payload.payloadId = 'payload-1';

    const encoded = JSON.stringify(payload);

    expect(encoded).toContain('"schemaVersion":1');
    expect(encoded).toContain('"source":"web"');
    expect(encoded).toContain('"projects":[]');
    expect(encoded).toContain('"sections":[]');
    expect(encoded).toContain('"tasks":[]');
    expect(encoded).toContain('"reminders":[]');
    expect(encoded).toContain('"locations":[]');
  });

  it('normalizes wrapped Android backup payloads through the sync envelope', () => {
    const payload = createEmptySyncPayload('device-1');
    payload.exportedAt = 123;
    payload.payloadId = 'payload-1';
    payload.source = 'android';

    const normalized = normalizeImportedPayload({ sync: payload, activity: [] }, 'Imported JSON file');

    expect(normalized).toMatchObject({
      deviceId: 'device-1',
      payloadId: 'payload-1',
      source: 'android',
    });
  });

  it('normalizes legacy flat Android backup payloads', () => {
    const normalized = normalizeImportedPayload({
      schemaVersion: 1,
      exportedAt: 123,
      deviceId: 'legacy-device',
      projects: [],
      sections: [],
      tasks: [],
      reminders: [],
      locations: [],
      activity: [],
    }, 'Imported JSON file');

    expect(normalized).toMatchObject({
      deviceId: 'legacy-device',
      payloadId: '',
      source: 'android-legacy-backup',
    });
  });

  it('rejects payloads from newer schema versions', () => {
    const payload = createEmptySyncPayload('device-1');
    payload.schemaVersion = 999;

    expect(() => assertSupportedSyncPayload(payload, 'Cloud sync file'))
      .toThrow('Cloud sync file is from a newer app version.');
  });
});
