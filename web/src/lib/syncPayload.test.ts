import { describe, expect, it } from 'vitest';
import { createEmptySyncPayload } from './syncPayload';

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
});
