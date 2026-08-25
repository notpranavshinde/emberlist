import { createHmac, timingSafeEqual } from 'node:crypto';

export function createRevisionToken(fileId, etag, secret = process.env.EMBERLIST_MCP_AUTH_SECRET) {
  requireSecret(secret);
  const payload = Buffer.from(JSON.stringify({ fileId, etag })).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

export function readRevisionToken(token, secret = process.env.EMBERLIST_MCP_AUTH_SECRET) {
  requireSecret(secret);
  if (typeof token !== 'string') throwInvalidRevision();
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra || !safeEqual(signature, sign(payload, secret))) {
    throwInvalidRevision();
  }
  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if ((value.fileId !== null && typeof value.fileId !== 'string')
      || (value.etag !== null && typeof value.etag !== 'string')) {
      throw new Error();
    }
    return value;
  } catch {
    throwInvalidRevision();
  }
}

export function assertCurrentRevision(token, current, secret) {
  const expected = readRevisionToken(token, secret);
  if (expected.fileId !== current.fileId || expected.etag !== current.etag) {
    const error = new Error('The workspace revision is stale. Read the workspace again before replacing it.');
    error.statusCode = 409;
    error.code = 'revision_conflict';
    throw error;
  }
}

function sign(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function safeEqual(left, right) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function requireSecret(secret) {
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new Error('EMBERLIST_MCP_AUTH_SECRET must contain at least 32 characters.');
  }
}

function throwInvalidRevision() {
  const error = new Error('The workspace revision token is invalid.');
  error.statusCode = 400;
  error.code = 'invalid_revision';
  throw error;
}
