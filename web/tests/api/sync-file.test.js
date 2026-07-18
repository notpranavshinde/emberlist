import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { MAX_SYNC_BODY_BYTES } from '../../api/_lib/sync-payload.js';
import { readJsonBody } from '../../api/drive/sync-file.js';

describe('sync upload body reader', () => {
  it('parses bounded JSON requests', async () => {
    const req = bodyRequest(['{"schemaVersion":1}']);
    await expect(readJsonBody(req)).resolves.toEqual({ schemaVersion: 1 });
  });

  it('rejects unsupported media types', async () => {
    const req = bodyRequest(['{}'], { 'content-type': 'text/plain' });
    await expect(readJsonBody(req)).rejects.toMatchObject({ statusCode: 415 });
  });

  it('rejects a declared oversized body without buffering it', async () => {
    const req = bodyRequest([], { 'content-length': String(MAX_SYNC_BODY_BYTES + 1) });
    await expect(readJsonBody(req)).rejects.toMatchObject({ statusCode: 413 });
  });

  it('stops when streamed bytes exceed the limit', async () => {
    const req = bodyRequest([
      Buffer.alloc(MAX_SYNC_BODY_BYTES, 32),
      Buffer.from('x'),
    ]);
    await expect(readJsonBody(req)).rejects.toMatchObject({ statusCode: 413 });
  });
});

function bodyRequest(chunks, extraHeaders = {}) {
  const req = Readable.from(chunks);
  req.headers = { 'content-type': 'application/json', ...extraHeaders };
  return req;
}
