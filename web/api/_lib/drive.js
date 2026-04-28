import { refreshAccessToken, requireSession, throwGoogleError } from './auth.js';

const SYNC_FILE_NAME = 'emberlist_sync.json';

export async function getAccessTokenForRequest(req) {
  const session = requireSession(req);
  return refreshAccessToken(session.refreshToken);
}

export async function downloadSyncPayload(accessToken) {
  const fileId = await findSyncFileId(accessToken);
  if (!fileId) {
    return { fileId: null, payload: null };
  }

  const response = await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    accessToken,
  );
  if (response.status === 404) {
    return { fileId: null, payload: null };
  }
  if (!response.ok) {
    await throwDriveError('download sync payload', response);
  }
  return {
    fileId,
    payload: await response.json(),
  };
}

export async function uploadSyncPayload(accessToken, payload) {
  const fileId = await findSyncFileId(accessToken);
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
    ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=id`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';
  const response = await driveFetch(url, accessToken, {
    method: fileId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!response.ok) {
    await throwDriveError('upload sync payload', response);
  }
  return response.json();
}

export async function deleteSyncPayloads(accessToken) {
  const fileIds = await findSyncFileIds(accessToken);
  for (const fileId of fileIds) {
    const response = await driveFetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}`,
      accessToken,
      { method: 'DELETE' },
    );
    if (!response.ok && response.status !== 404) {
      await throwDriveError('delete sync payload', response);
    }
  }
  return fileIds.length;
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
