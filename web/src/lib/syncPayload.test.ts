import { describe, expect, it } from 'vitest';
import { assertSupportedSyncPayload, createEmptySyncPayload, ensureSyncPayload, normalizeImportedPayload } from './syncPayload';

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


  it('rejects payload roots with non-plain object prototypes', () => {
    const payload = createEmptySyncPayload('device-1');
    payload.exportedAt = 123;
    payload.payloadId = 'payload-1';

    const nonPlain = Object.create(new Date());
    Object.assign(nonPlain, payload);

    expect(() => ensureSyncPayload(nonPlain, 'Cloud sync file'))
      .toThrow('Cloud sync file is invalid: expected a JSON object.');
  });

  it('rejects task entities with non-plain object prototypes', () => {
    const payload = createEmptySyncPayload('device-1');
    payload.exportedAt = 123;
    payload.payloadId = 'payload-1';

    const task = Object.create(new Map());
    Object.assign(task, {
      id: 'task-1',
      title: 'Task',
      description: '',
      projectId: null,
      sectionId: null,
      priority: 'P4',
      dueAt: null,
      allDay: false,
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
    });

    const malformed = {
      ...payload,
      tasks: [task],
    };

    expect(() => ensureSyncPayload(malformed, 'Cloud sync file'))
      .toThrow('Cloud sync file.tasks[0] is invalid: expected an object.');
  });

  it('rejects payloads from newer schema versions', () => {
    const payload = createEmptySyncPayload('device-1');
    payload.schemaVersion = 999;

    expect(() => assertSupportedSyncPayload(payload, 'Cloud sync file'))
      .toThrow('Cloud sync file is from a newer app version.');
  });
});
