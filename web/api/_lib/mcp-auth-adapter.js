import { refreshAccessToken } from './auth.js';
import { writeAuditEvent } from './mcp-db.js';
import {
  assertMcpEnabled,
  bearerToken,
  claimMcpMutation,
  completeMcpMutation,
  getMcpConfig,
  getMcpGoogleRefreshToken,
  MCP_SCOPE,
  releaseMcpMutation,
  verifyMcpAccessToken,
} from './mcp-auth.js';

export async function resolveMcpRequest(req) {
  assertMcpEnabled();
  const rawToken = bearerToken(req);
  const authInfo = rawToken ? await verifyMcpAccessToken(rawToken) : null;
  const config = getMcpConfig(req);
  if (!authInfo || !authInfo.scopes?.includes(MCP_SCOPE) || authInfo.resource !== config.resource) {
    await auditBearerFailure();
    unauthorized();
  }
  const refreshToken = await getMcpGoogleRefreshToken(authInfo.extra.grantId, req);
  if (!refreshToken) {
    await auditBearerFailure();
    unauthorized();
  }
  const accessToken = await refreshAccessToken(refreshToken);
  return {
    authInfo,
    accessToken,
    timeZone: authInfo.extra.timeZone || 'UTC',
    mutationStore: mutationStore(authInfo.extra.grantId),
  };
}

async function auditBearerFailure() {
  try { await writeAuditEvent('mcp_bearer_failure'); } catch { /* Best effort. */ }
}

function mutationStore(grantId) {
  return {
    async claim(mutationId, requestHash) {
      const claim = await claimMcpMutation(grantId, mutationId, requestHash);
      if (claim.status === 'replay') return { replayed: true, result: claim.result };
      if (claim.status === 'in_progress') {
        const error = new Error('A request with this mutationId is already in progress.');
        error.statusCode = 409;
        throw error;
      }
      return { replayed: false };
    },
    async complete(mutationId, requestHash, result) {
      await completeMcpMutation(grantId, mutationId, requestHash, conciseResult(result));
    },
    async release(mutationId, requestHash) {
      await releaseMcpMutation(grantId, mutationId, requestHash);
    },
  };
}

export function conciseResult(result) {
  const multiple = Array.isArray(result.entity);
  const entities = multiple ? result.entity : result.entity ? [result.entity] : [];
  const entityIds = entities.map(entity => entity?.id).filter(entityId => typeof entityId === 'string');
  return {
    ...(!multiple && entityIds.length === 1 ? { entityId: entityIds[0] } : {}),
    ...(multiple && entityIds.length ? { entityIds } : {}),
    ...(result.revision ? { revision: result.revision } : {}),
  };
}

function unauthorized() {
  const error = new Error('A valid Emberlist workspace access token is required.');
  error.statusCode = 401;
  error.code = 'invalid_token';
  throw error;
}
