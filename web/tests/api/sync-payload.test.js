import { describe, expect, it } from 'vitest';
import { validateSyncPayload } from '../../api/_lib/sync-payload.js';

describe('server sync payload validation', () => {
  it('accepts an empty schema-version 1 payload', () => {
    expect(validateSyncPayload(validPayload())).toEqual(validPayload());
  });

  it('rejects malformed entity fields', () => {
    const payload = validPayload();
    payload.tasks.push({ id: 'task-without-required-fields' });
    expect(() => validateSyncPayload(payload)).toThrow('tasks[0].createdAt must be a finite number');
  });

  it('rejects unbounded text fields', () => {
    const payload = validPayload();
    payload.projects.push({
      id: 'project',
      name: 'x'.repeat(1_025),
      color: '#000',
      favorite: false,
      order: 0,
      archived: false,
      viewPreference: null,
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
    });
    expect(() => validateSyncPayload(payload)).toThrow('projects[0].name exceeds 1024 characters');
  });

  it('rejects excessive collection counts', () => {
    const payload = validPayload();
    payload.tasks = Array.from({ length: 10_001 });
    expect(() => validateSyncPayload(payload)).toThrow('tasks contains more than 10000 entries');
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
