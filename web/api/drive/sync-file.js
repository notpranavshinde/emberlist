import {
  assertSameOrigin,
  handleApiError,
  json,
  methodNotAllowed,
  setNoStore,
} from '../_lib/auth.js';
import {
  deleteSyncPayloads,
  downloadSyncPayload,
  getAccessTokenForRequest,
  uploadSyncPayload,
} from '../_lib/drive.js';
import { enforceRateLimit } from '../_lib/rate-limit.js';
import { MAX_SYNC_BODY_BYTES, validateSyncPayload } from '../_lib/sync-payload.js';

export default async function handler(req, res) {
  setNoStore(res);
  if (!['GET', 'PUT', 'DELETE'].includes(req.method)) {
    methodNotAllowed(res, ['GET', 'PUT', 'DELETE']);
    return;
  }

  try {
    if (req.method !== 'GET') {
      assertSameOrigin(req);
    }
    await enforceRateLimit(req, res, {
      name: req.method === 'GET' ? 'sync-read' : 'sync-write',
      limit: req.method === 'GET' ? 120 : 30,
      windowSeconds: 60,
      includeSession: true,
    });

    let uploadPayload = null;
    if (req.method === 'PUT') {
      uploadPayload = await readJsonBody(req);
      validateSyncPayload(uploadPayload);
    }

    const accessToken = await getAccessTokenForRequest(req);

    if (req.method === 'GET') {
      const result = await downloadSyncPayload(accessToken);
      json(res, 200, result);
      return;
    }

    if (req.method === 'PUT') {
      await uploadSyncPayload(accessToken, uploadPayload);
      json(res, 200, { ok: true });
      return;
    }

    const deletedCount = await deleteSyncPayloads(accessToken);
    json(res, 200, { ok: true, deletedCount });
  } catch (error) {
    handleApiError(res, error);
  }
}

export async function readJsonBody(req) {
  const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') {
    const error = new Error('Content-Type must be application/json.');
    error.statusCode = 415;
    throw error;
  }
  const declaredLength = Number(req.headers['content-length']);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SYNC_BODY_BYTES) {
    throwPayloadTooLarge();
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_SYNC_BODY_BYTES) throwPayloadTooLarge();
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) {
    const error = new Error('Request body is required.');
    error.statusCode = 400;
    throw error;
  }
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error('Request body must be valid JSON.');
    error.statusCode = 400;
    throw error;
  }
}

function throwPayloadTooLarge() {
  const error = new Error(`Request body exceeds the ${MAX_SYNC_BODY_BYTES}-byte limit.`);
  error.statusCode = 413;
  throw error;
}
