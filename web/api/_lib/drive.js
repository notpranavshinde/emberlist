import { refreshAccessToken, requireSession, throwGoogleError } from './auth.js';
import { MAX_SYNC_BODY_BYTES, validateSyncPayload } from './sync-payload.js';

const SYNC_FILE_NAME = 'emberlist_sync.json';

export async function getAccessTokenForRequest(req) {
  const session = requireSession(req);
  return refreshAccessToken(session.refreshToken);
}

export async function downloadSyncPayload(accessToken) {
  const fileId = await findSyncFileId(accessToken);
  if (!fileId) {
    return { fileId: null, payload: null, etag: null };
  }

  const metadata = await getDriveFileMetadata(fileId, accessToken);
  if (!metadata?.version) {
    return { fileId: null, payload: null, etag: null };
  }

  const response = await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    accessToken,
  );
  if (response.status === 404) {
    return { fileId: null, payload: null, etag: null };
  }
  if (!response.ok) {
    await throwDriveError('download sync payload', response);
  }
  return {
    fileId,
    payload: await readDriveSyncPayload(response),
    etag: `version:${metadata.version}`,
  };
}

async function getDriveFileMetadata(fileId, accessToken) {
  const response = await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id%2Cversion`,
    accessToken,
  );
  if (response.status === 404) return null;
  if (!response.ok) await throwDriveError('read sync payload metadata', response);
  return response.json();
}

export async function readDriveSyncPayload(response) {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SYNC_BODY_BYTES) {
    throwInvalidDrivePayload(`Drive sync file exceeds the ${MAX_SYNC_BODY_BYTES}-byte limit.`);
  }

  const chunks = [];
  let size = 0;
  if (!response.body) throwInvalidDrivePayload('Drive sync file is empty.');
  for await (const chunk of response.body) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_SYNC_BODY_BYTES) {
      throwInvalidDrivePayload(`Drive sync file exceeds the ${MAX_SYNC_BODY_BYTES}-byte limit.`);
    }
    chunks.push(buffer);
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throwInvalidDrivePayload('Drive sync file must contain valid JSON.');
  }
  try {
    validateSyncPayload(payload);
  } catch (error) {
    throwInvalidDrivePayload(error instanceof Error
      ? `Drive sync file is invalid: ${error.message}`
      : 'Drive sync file is invalid.');
  }
  return payload;
}

export async function uploadSyncPayload(accessToken, payload, options = {}) {
  const fileId = options.fileId === undefined
    ? await findSyncFileId(accessToken)
    : options.fileId;
  if (fileId && options.ifMatch) {
    return uploadSyncPayloadConditionally(accessToken, fileId, payload, options.ifMatch);
  }
  const metadata = {
    name: SYNC_FILE_NAME,
    mimeType: 'application/json',
    ...(fileId ? {} : { parents: ['appDataFolder'] }),
  };
  const boundary = 'emberlist_sync_boundary';
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(payload),
    `--${boundary}--`,
    '',
  ].join('\r\n');

  const url = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=id%2Cversion`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id%2Cversion';
  const response = await uploadFetch(url, accessToken, {
    method: fileId ? 'PATCH' : 'POST',
    headers: {
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!response.ok) {
    if (response.status === 412) {
      throwRevisionConflict();
    }
    await throwUploadError('upload sync payload', response);
  }
  return readUploadResult(response);
}

async function uploadSyncPayloadConditionally(accessToken, fileId, payload, ifMatch) {
  // Drive v3 omits file ETags; v2 supplies the strong ETag required for atomic If-Match updates.
  const response = await driveFetch(
    `https://www.googleapis.com/drive/v2/files/${fileId}?fields=id%2Cversion%2Cetag`,
    accessToken,
  );
  if (response.status === 404) throwRevisionConflict();
  if (!response.ok) await throwDriveError('read sync payload precondition', response);
  const current = await response.json();
  if (ifMatch !== `version:${current.version}`) throwRevisionConflict();
  if (typeof current.etag !== 'string' || !current.etag) {
    const error = new Error('Google Drive did not return the ETag required for a conditional update.');
    error.statusCode = 502;
    error.code = 'drive_precondition_unavailable';
    throw error;
  }

  const upload = await uploadFetch(
    `https://www.googleapis.com/upload/drive/v2/files/${fileId}?uploadType=media&fields=id%2Cversion`,
    accessToken,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'If-Match': current.etag,
      },
      body: JSON.stringify(payload),
    },
  );
  if (upload.status === 412) throwRevisionConflict();
  if (!upload.ok) await throwUploadError('conditionally upload sync payload', upload);
  return readUploadResult(upload);
}

function throwRevisionConflict() {
  const error = new Error('The Drive workspace changed since it was read.');
  error.statusCode = 409;
  error.code = 'revision_conflict';
  throw error;
}

async function findSyncFileId(accessToken) {
  const ids = await findSyncFileIds(accessToken);
  return ids[0] ?? null;
}

async function findSyncFileIds(accessToken) {
  const params = new URLSearchParams({
    spaces: 'appDataFolder',
    fields: 'files(id,modifiedTime)',
    q: `name = '${SYNC_FILE_NAME}' and trashed = false`,
  });
  const response = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
    accessToken,
  );
  if (!response.ok) {
    await throwDriveError('query sync payload', response);
  }
  const body = await response.json();
  return (body.files ?? [])
    .filter((file) => typeof file.id === 'string' && file.id.length > 0)
    .sort((left, right) => {
      const leftTime = parseDriveModifiedTime(left.modifiedTime);
      const rightTime = parseDriveModifiedTime(right.modifiedTime);
      if (leftTime !== rightTime) return rightTime - leftTime;
      return right.id.localeCompare(left.id);
    })
    .map((file) => file.id);
}

async function driveFetch(url, accessToken, init = {}) {
  return fetch(url, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

async function uploadFetch(url, accessToken, init) {
  try {
    return await driveFetch(url, accessToken, init);
  } catch (error) {
    throw commitUncertain(error);
  }
}

async function readUploadResult(response) {
  try {
    return await response.json();
  } catch (error) {
    throw commitUncertain(error);
  }
}

async function throwUploadError(action, response) {
  try {
    await throwDriveError(action, response);
  } catch (error) {
    throw response.status >= 500 ? commitUncertain(error) : error;
  }
}

function commitUncertain(error) {
  const result = error instanceof Error ? error : new Error('The Drive upload outcome is uncertain.', { cause: error });
  result.commitUncertain = true;
  return result;
}

async function throwDriveError(action, response) {
  let body = {};
  try {
    body = await response.json();
  } catch {
    body = { error: await response.text().catch(() => '') };
  }
  throwGoogleError(action, response.status, body);
}

function parseDriveModifiedTime(value) {
  if (!value) return Number.MIN_SAFE_INTEGER;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.MIN_SAFE_INTEGER : parsed;
}

function throwInvalidDrivePayload(message) {
  const error = new Error(message);
  error.statusCode = 502;
  throw error;
}
