import {
  assertSameOrigin,
  handleApiError,
  json,
  methodNotAllowed,
} from '../_lib/auth.js';
import {
  deleteSyncPayloads,
  downloadSyncPayload,
  getAccessTokenForRequest,
  uploadSyncPayload,
} from '../_lib/drive.js';

export default async function handler(req, res) {
  if (!['GET', 'PUT', 'DELETE'].includes(req.method)) {
    methodNotAllowed(res, ['GET', 'PUT', 'DELETE']);
    return;
  }

  try {
    if (req.method !== 'GET') {
      assertSameOrigin(req);
    }

    const accessToken = await getAccessTokenForRequest(req);

    if (req.method === 'GET') {
      const result = await downloadSyncPayload(accessToken);
      json(res, 200, result);
      return;
    }

    if (req.method === 'PUT') {
      const payload = await readJsonBody(req);
      await uploadSyncPayload(accessToken, payload);
      json(res, 200, { ok: true });
      return;
    }

    const deletedCount = await deleteSyncPayloads(accessToken);
    json(res, 200, { ok: true, deletedCount });
  } catch (error) {
    handleApiError(res, error);
  }
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
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
