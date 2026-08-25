import { createHash } from 'node:crypto';
import { downloadSyncPayload, uploadSyncPayload } from './drive.js';
import { assertCurrentRevision, createRevisionToken } from './mcp-revision.js';
import {
  applyWorkspaceOperation,
  emptyWorkspace,
  mergeWorkspaces,
  validateExactWorkspace,
  validateMergeWorkspace,
} from './mcp-workspace.js';

export function createDriveWorkspaceStore({
  accessToken,
  timeZone = 'UTC',
  revisionSecret = process.env.EMBERLIST_MCP_AUTH_SECRET,
  mutationStore = null,
  authInfo = null,
}) {
  if (!accessToken) throw new Error('A Google Drive access token is required.');

  async function read() {
    const current = await downloadSyncPayload(accessToken);
    if (current.fileId && !current.etag) {
      const error = new Error('Google Drive did not return a workspace ETag for concurrency control.');
      error.statusCode = 502;
      throw error;
    }
    return {
      ...current,
      payload: current.payload ?? emptyWorkspace(),
      revision: createRevisionToken(current.fileId, current.etag, revisionSecret),
    };
  }

  async function semantic(operation, args) {
    const effectiveArgs = { ...args, timeZone: args.timeZone ?? timeZone };
    if (CREATE_OPERATIONS.has(operation) && !effectiveArgs.id) {
      effectiveArgs.id = stableCreateId(operation, args.mutationId, authInfo?.extra?.grantId);
    }
    const response = await idempotent(args.mutationId, { operation, args }, async () => {
      let lastConflict;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const current = await read();
        if (CREATE_OPERATIONS.has(operation) && hasEntity(current.payload, operation, effectiveArgs.id)) {
          return semanticResult(operation, effectiveArgs, current.payload, current.revision);
        }
        const payload = applyWorkspaceOperation(current.payload, operation, effectiveArgs);
        validateMergeWorkspace(payload);
        try {
          const uploaded = await uploadSyncPayload(accessToken, payload, {
            fileId: current.fileId,
            ifMatch: current.etag,
          });
          return semanticResult(operation, effectiveArgs, payload, committedRevision(uploaded, current.fileId));
        } catch (error) {
          if (error?.code !== 'revision_conflict') throw error;
          lastConflict = error;
        }
      }
      throw lastConflict;
    });
    return response.replayed ? hydrateReplay(operation, response) : response;
  }

  async function merge(incoming, mutationId) {
    validateMergeWorkspace(incoming);
    const response = await idempotent(mutationId, { operation: 'merge_workspace_payload', incoming }, async () => {
      let lastConflict;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const current = await read();
        const payload = mergeWorkspaces(current.payload, incoming, Date.now(), timeZone);
        validateMergeWorkspace(payload);
        try {
          const uploaded = await uploadSyncPayload(accessToken, payload, { fileId: current.fileId, ifMatch: current.etag });
          return { entity: null, revision: committedRevision(uploaded, current.fileId),
            replayed: false };
        } catch (error) {
          if (error?.code !== 'revision_conflict') throw error;
          lastConflict = error;
        }
      }
      throw lastConflict;
    });
    return { ...response, entity: null };
  }

  async function replaceExact(incoming, revision, mutationId) {
    validateExactWorkspace(incoming);
    const response = await idempotent(mutationId, { operation: 'replace_workspace_payload', incoming, revision }, async () => {
      const current = await read();
      assertCurrentRevision(revision, current, revisionSecret);
      const uploaded = await uploadSyncPayload(accessToken, incoming, { fileId: current.fileId, ifMatch: current.etag });
      return { entity: null, revision: committedRevision(uploaded, current.fileId),
        replayed: false };
    });
    return { ...response, entity: null };
  }

  async function hydrateReplay(operation, response) {
    if (!response.entityId && !response.entityIds?.length) {
      return { entity: null, revision: response.revision, replayed: true };
    }
    const current = await read();
    return { entity: resultEntities(operation, response, current.payload), revision: current.revision, replayed: true };
  }

  async function idempotent(mutationId, request, execute) {
    if (typeof mutationId !== 'string' || mutationId.length < 8 || mutationId.length > 200) {
      const error = new Error('mutationId must contain 8 to 200 characters.'); error.statusCode = 400; throw error;
    }
    if (!mutationStore) return { ...(await execute()), replayed: false };
    const hash = hashRequest(request);
    const claim = await mutationStore.claim(mutationId, hash);
    if (claim?.replayed) return { ...claim.result, replayed: true };
    let result;
    try {
      result = await execute();
    } catch (error) {
      if (!error?.commitUncertain) await mutationStore.release?.(mutationId, hash);
      throw error;
    }
    await mutationStore.complete(mutationId, hash, result);
    return { ...result, replayed: false };
  }

  function committedRevision(uploaded, fallbackFileId) {
    const fileId = uploaded?.id ?? fallbackFileId;
    if (!fileId || uploaded?.version === undefined || uploaded?.version === null) {
      const error = new Error('Google Drive did not return the committed workspace version.');
      error.statusCode = 502;
      error.commitUncertain = true;
      throw error;
    }
    return createRevisionToken(fileId, `version:${uploaded.version}`, revisionSecret);
  }

  return { read, semantic, merge, replaceExact };
}

function hashRequest(value) {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function resultEntityId(operation, args, payload) {
  const explicit = args.id ?? args.taskId ?? args.projectId ?? args.sectionId ?? args.reminderId ?? args.locationId;
  if (explicit) return explicit;
  const collection = operation.split('_')[1];
  return payload[`${collection}s`]?.at(-1)?.id ?? null;
}

function semanticResult(operation, args, payload, revision) {
  const entityIds = resultEntityIds(operation, args, payload);
  const multiple = Array.isArray(args.taskIds);
  const entity = resultEntities(operation, multiple ? { entityIds } : { entityId: entityIds[0] }, payload);
  return { entity, revision, replayed: false };
}

function resultEntityIds(operation, args, payload) {
  if (Array.isArray(args.taskIds)) return args.taskIds;
  const entityId = resultEntityId(operation, args, payload);
  return entityId ? [entityId] : [];
}

function resultEntities(operation, result, payload) {
  const collection = entityCollection(operation);
  if (!collection) return null;
  const entityIds = result.entityIds ?? (result.entityId ? [result.entityId] : []);
  const entities = entityIds.map(entityId => payload[collection].find(item => item.id === entityId)).filter(Boolean);
  return Array.isArray(result.entityIds) ? entities : (entities[0] ?? null);
}

function entityCollection(operation) {
  if (operation.includes('task')) return 'tasks';
  if (operation.includes('project')) return 'projects';
  if (operation.includes('section')) return 'sections';
  if (operation.includes('reminder')) return 'reminders';
  if (operation.includes('location')) return 'locations';
  return null;
}

function hasEntity(payload, operation, entityId) {
  const collection = entityCollection(operation);
  return Boolean(collection && payload[collection].some(item => item.id === entityId));
}

const CREATE_OPERATIONS = new Set(['create_task', 'create_project', 'create_section', 'create_reminder', 'create_location']);

function stableCreateId(operation, mutationId, grantId = '') {
  const digest = createHash('sha256')
    .update(`${grantId}\0${operation}\0${mutationId}`)
    .digest('hex')
    .slice(0, 32);
  return `mcp-${digest}`;
}
