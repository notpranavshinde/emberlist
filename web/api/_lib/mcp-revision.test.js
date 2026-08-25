import { describe, expect, it } from 'vitest';
import { assertCurrentRevision, createRevisionToken, readRevisionToken } from './mcp-revision.js';

const secret = 'a-secret-that-is-at-least-thirty-two-characters';

describe('MCP revision tokens', () => {
  it('round-trips a signed Drive revision and rejects tampering and stale revisions', () => {
    const token = createRevisionToken('file', '"etag"', secret);
    expect(readRevisionToken(token, secret)).toEqual({ fileId: 'file', etag: '"etag"' });
    expect(() => readRevisionToken(`${token}x`, secret)).toThrow('invalid');
    expect(() => assertCurrentRevision(token, { fileId: 'file', etag: '"new"' }, secret))
      .toThrow('stale');
  });
});
