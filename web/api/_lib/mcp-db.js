let sqlPromise;

export function setMcpSqlForTests(sql) {
  if (process.env.NODE_ENV !== 'test') throw new Error('MCP database injection is test-only.');
  sqlPromise = sql ? Promise.resolve(sql) : undefined;
}

export async function getMcpSql() {
  if (!process.env.DATABASE_URL) throw serverError('DATABASE_URL is not configured.');
  if (!sqlPromise) {
    sqlPromise = import('postgres').then(({ default: postgres }) => postgres(process.env.DATABASE_URL, {
      max: 4,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    }));
  }
  return sqlPromise;
}

export async function closeMcpSql() {
  if (!sqlPromise) return;
  const sql = await sqlPromise;
  sqlPromise = undefined;
  await sql.end({ timeout: 5 });
}

export async function registerOAuthClient(client) {
  const sql = await getMcpSql();
  const [row] = await sql`
    INSERT INTO mcp_oauth_clients (client_id, client_name, redirect_uris)
    VALUES (${client.clientId}, ${client.clientName}, ${sql.json(client.redirectUris)})
    RETURNING client_id, client_name, redirect_uris, created_at
  `;
  return row;
}

export async function getOAuthClient(clientId) {
  const sql = await getMcpSql();
  const [row] = await sql`
    SELECT client_id, client_name, redirect_uris, created_at
    FROM mcp_oauth_clients
    WHERE client_id = ${clientId} AND disabled_at IS NULL
  `;
  return row ?? null;
}

export async function createAuthorizationRequest(request) {
  const sql = await getMcpSql();
  await sql`
    INSERT INTO mcp_oauth_authorization_requests
      (id, client_id, redirect_uri, state, scope, offline_access, resource, code_challenge, expires_at)
    VALUES
      (${request.id}, ${request.clientId}, ${request.redirectUri}, ${request.state}, ${request.scope}, ${request.offlineAccess},
       ${request.resource}, ${request.codeChallenge}, ${request.expiresAt})
  `;
}

export async function getAuthorizationRequest(id) {
  const sql = await getMcpSql();
  const [row] = await sql`
    SELECT request.*, client.client_name
    FROM mcp_oauth_authorization_requests request
    JOIN mcp_oauth_clients client ON client.client_id = request.client_id
    WHERE request.id = ${id}
  `;
  return row ?? null;
}

export async function approveAuthorizationRequest({ requestId, grant, code }) {
  const sql = await getMcpSql();
  return sql.begin(async (tx) => {
    const [request] = await tx`
      UPDATE mcp_oauth_authorization_requests
      SET approved_at = CURRENT_TIMESTAMP
      WHERE id = ${requestId}
        AND approved_at IS NULL
        AND denied_at IS NULL
        AND expires_at > CURRENT_TIMESTAMP
      RETURNING *
    `;
    if (!request) return null;
    await tx`
      INSERT INTO mcp_oauth_grants
        (id, client_id, account_id, encrypted_google_refresh_token, time_zone, scope, expires_at)
      VALUES
        (${grant.id}, ${request.client_id}, ${grant.accountId}, ${grant.encryptedGoogleRefreshToken},
         ${grant.timeZone}, ${request.scope}, ${grant.expiresAt})
    `;
    await tx`
      INSERT INTO mcp_oauth_codes
        (code_hash, grant_id, client_id, redirect_uri, code_challenge, scope, offline_access, resource, expires_at)
      VALUES
        (${code.hash}, ${grant.id}, ${request.client_id}, ${request.redirect_uri},
         ${request.code_challenge}, ${request.scope}, ${request.offline_access}, ${request.resource}, ${code.expiresAt})
    `;
    return request;
  });
}

export async function denyAuthorizationRequest(requestId) {
  const sql = await getMcpSql();
  const [row] = await sql`
    UPDATE mcp_oauth_authorization_requests
    SET denied_at = CURRENT_TIMESTAMP
    WHERE id = ${requestId}
      AND approved_at IS NULL
      AND denied_at IS NULL
      AND expires_at > CURRENT_TIMESTAMP
    RETURNING *
  `;
  return row ?? null;
}

export async function getAuthorizationCode(codeHash) {
  const sql = await getMcpSql();
  const [row] = await sql`
    SELECT code.*, grant_row.revoked_at, grant_row.expires_at AS grant_expires_at
    FROM mcp_oauth_codes code
    JOIN mcp_oauth_grants grant_row ON grant_row.id = code.grant_id
    WHERE code.code_hash = ${codeHash}
  `;
  return row ?? null;
}

export async function consumeAuthorizationCodeAndIssue(codeHash, access, refresh) {
  const sql = await getMcpSql();
  return sql.begin(async (tx) => {
    const [code] = await tx`
      UPDATE mcp_oauth_codes
      SET consumed_at = CURRENT_TIMESTAMP
      WHERE code_hash = ${codeHash}
        AND consumed_at IS NULL
        AND expires_at > CURRENT_TIMESTAMP
      RETURNING *
    `;
    if (!code) return null;
    await insertAccessToken(tx, access);
    if (refresh) await insertRefreshToken(tx, refresh);
    return code;
  });
}

export async function getRefreshToken(tokenHash) {
  const sql = await getMcpSql();
  const [row] = await sql`
    SELECT token.*, grant_row.revoked_at, grant_row.expires_at AS grant_expires_at
    FROM mcp_oauth_refresh_tokens token
    JOIN mcp_oauth_grants grant_row ON grant_row.id = token.grant_id
    WHERE token.token_hash = ${tokenHash}
  `;
  return row ?? null;
}

export async function rotateRefreshToken(oldHash, access, refresh) {
  const sql = await getMcpSql();
  return sql.begin(async (tx) => {
    const [old] = await tx`
      UPDATE mcp_oauth_refresh_tokens
      SET consumed_at = CURRENT_TIMESTAMP
      WHERE token_hash = ${oldHash}
        AND consumed_at IS NULL
        AND expires_at > CURRENT_TIMESTAMP
      RETURNING *
    `;
    if (!old) return null;
    await insertAccessToken(tx, access);
    await insertRefreshToken(tx, refresh);
    return old;
  });
}

export async function revokeGrantForTokenHash(tokenHash) {
  const sql = await getMcpSql();
  const [row] = await sql`
    DELETE FROM mcp_oauth_grants
    WHERE id IN (
      SELECT grant_id FROM mcp_oauth_access_tokens WHERE token_hash = ${tokenHash}
      UNION
      SELECT grant_id FROM mcp_oauth_refresh_tokens WHERE token_hash = ${tokenHash}
    )
    RETURNING id, client_id
  `;
  return row ?? null;
}

export async function revokeGrant(grantId, accountId = null) {
  const sql = await getMcpSql();
  const [row] = await sql`
    DELETE FROM mcp_oauth_grants
    WHERE id = ${grantId}
      AND (${accountId}::text IS NULL OR account_id = ${accountId})
    RETURNING id, client_id
  `;
  return row ?? null;
}

export async function findAccessToken(tokenHash) {
  const sql = await getMcpSql();
  const [row] = await sql`
    SELECT token.token_hash, token.client_id, token.scope, token.resource, token.expires_at,
           grant_row.id AS grant_id, grant_row.account_id, grant_row.time_zone, grant_row.revoked_at,
           grant_row.expires_at AS grant_expires_at
    FROM mcp_oauth_access_tokens token
    JOIN mcp_oauth_grants grant_row ON grant_row.id = token.grant_id
    WHERE token.token_hash = ${tokenHash}
  `;
  if (row && !row.revoked_at) {
    await sql`UPDATE mcp_oauth_grants SET last_used_at = CURRENT_TIMESTAMP WHERE id = ${row.grant_id}`;
  }
  return row ?? null;
}

export async function getGrantSecret(grantId) {
  const sql = await getMcpSql();
  const [row] = await sql`
    SELECT encrypted_google_refresh_token, revoked_at, expires_at
    FROM mcp_oauth_grants
    WHERE id = ${grantId}
  `;
  return row ?? null;
}

export async function listGrantsForAccount(accountId) {
  const sql = await getMcpSql();
  return sql`
    SELECT grant_row.id, client.client_name, grant_row.created_at, grant_row.last_used_at,
           grant_row.expires_at, grant_row.time_zone
    FROM mcp_oauth_grants grant_row
    JOIN mcp_oauth_clients client ON client.client_id = grant_row.client_id
    WHERE grant_row.account_id = ${accountId}
      AND grant_row.revoked_at IS NULL
      AND grant_row.expires_at > CURRENT_TIMESTAMP
    ORDER BY grant_row.created_at DESC
  `;
}

export async function updateGrantTimeZone(grantId, accountId, timeZone) {
  const sql = await getMcpSql();
  const [row] = await sql`
    UPDATE mcp_oauth_grants
    SET time_zone = ${timeZone}
    WHERE id = ${grantId}
      AND account_id = ${accountId}
      AND revoked_at IS NULL
      AND expires_at > CURRENT_TIMESTAMP
    RETURNING id, created_at, last_used_at, expires_at, time_zone
  `;
  return row ?? null;
}

export async function writeAuditEvent(eventName, { clientId = null, grantId = null } = {}) {
  const sql = await getMcpSql();
  await sql`
    INSERT INTO mcp_security_audit_events (event_name, client_id, grant_id)
    VALUES (${eventName}, ${clientId}, ${grantId})
  `;
}

export async function claimMutationReplay(grantId, mutationIdHash, requestHash) {
  const sql = await getMcpSql();
  return sql.begin(async (tx) => {
    const [claimed] = await tx`
      INSERT INTO mcp_mutations (grant_id, mutation_id_hash, request_hash, status)
      VALUES (${grantId}, ${mutationIdHash}, ${requestHash}, 'pending')
      ON CONFLICT (grant_id, mutation_id_hash) DO NOTHING
      RETURNING request_hash, status, result_identifiers, created_at
    `;
    if (claimed) return { ...claimed, claimed: true };
    const [existing] = await tx`
      SELECT request_hash, status, result_identifiers, created_at
      FROM mcp_mutations
      WHERE grant_id = ${grantId} AND mutation_id_hash = ${mutationIdHash}
    `;
    return existing ? { ...existing, claimed: false } : null;
  });
}

export async function completeMutationReplay(grantId, mutationIdHash, requestHash, resultIdentifiers) {
  const sql = await getMcpSql();
  const [row] = await sql`
    UPDATE mcp_mutations
    SET status = 'completed', result_identifiers = ${sql.json(resultIdentifiers ?? {})}, updated_at = CURRENT_TIMESTAMP
    WHERE grant_id = ${grantId}
      AND mutation_id_hash = ${mutationIdHash}
      AND request_hash = ${requestHash}
      AND status = 'pending'
    RETURNING request_hash, status, result_identifiers, created_at
  `;
  return row ?? null;
}

export async function releaseMutationReplay(grantId, mutationIdHash, requestHash) {
  const sql = await getMcpSql();
  const result = await sql`
    DELETE FROM mcp_mutations
    WHERE grant_id = ${grantId}
      AND mutation_id_hash = ${mutationIdHash}
      AND request_hash = ${requestHash}
      AND status = 'pending'
  `;
  return result.count > 0;
}

export async function cleanupMcpDatabase() {
  const sql = await getMcpSql();
  return sql.begin(async (tx) => {
    const grants = await tx`
      DELETE FROM mcp_oauth_grants grant_row
      WHERE grant_row.expires_at < CURRENT_TIMESTAMP
        OR grant_row.revoked_at IS NOT NULL
        OR (
          NOT EXISTS (
            SELECT 1 FROM mcp_oauth_codes code
            WHERE code.grant_id = grant_row.id
              AND code.consumed_at IS NULL
              AND code.expires_at > CURRENT_TIMESTAMP
          )
          AND NOT EXISTS (
            SELECT 1 FROM mcp_oauth_access_tokens access
            WHERE access.grant_id = grant_row.id
              AND access.expires_at > CURRENT_TIMESTAMP
          )
          AND NOT EXISTS (
            SELECT 1 FROM mcp_oauth_refresh_tokens refresh
            WHERE refresh.grant_id = grant_row.id
              AND refresh.consumed_at IS NULL
              AND refresh.expires_at > CURRENT_TIMESTAMP
          )
        )
    `;
    const codes = await tx`DELETE FROM mcp_oauth_codes WHERE expires_at < CURRENT_TIMESTAMP OR consumed_at < CURRENT_TIMESTAMP - INTERVAL '1 day'`;
    const access = await tx`DELETE FROM mcp_oauth_access_tokens WHERE expires_at < CURRENT_TIMESTAMP`;
    const refresh = await tx`DELETE FROM mcp_oauth_refresh_tokens WHERE expires_at < CURRENT_TIMESTAMP`;
    const requests = await tx`DELETE FROM mcp_oauth_authorization_requests WHERE expires_at < CURRENT_TIMESTAMP`;
    const clients = await tx`
      DELETE FROM mcp_oauth_clients client
      WHERE client.created_at < CURRENT_TIMESTAMP - INTERVAL '30 days'
        AND NOT EXISTS (SELECT 1 FROM mcp_oauth_authorization_requests request WHERE request.client_id = client.client_id)
        AND NOT EXISTS (SELECT 1 FROM mcp_oauth_grants grant_row WHERE grant_row.client_id = client.client_id)
    `;
    const mutations = await tx`DELETE FROM mcp_mutations WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '24 hours'`;
    const audit = await tx`DELETE FROM mcp_security_audit_events WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '30 days'`;
    return {
      authorizationCodes: codes.count,
      grants: grants.count,
      accessTokens: access.count,
      refreshTokens: refresh.count,
      authorizationRequests: requests.count,
      clients: clients.count,
      mutations: mutations.count,
      auditEvents: audit.count,
    };
  });
}

export async function revokeAllMcpGrants() {
  const sql = await getMcpSql();
  const result = await sql`DELETE FROM mcp_oauth_grants`;
  return result.count;
}

async function insertAccessToken(sql, token) {
  await sql`
    INSERT INTO mcp_oauth_access_tokens
      (token_hash, grant_id, client_id, scope, resource, expires_at)
    VALUES
      (${token.hash}, ${token.grantId}, ${token.clientId}, ${token.scope}, ${token.resource}, ${token.expiresAt})
  `;
}

async function insertRefreshToken(sql, token) {
  await sql`
    INSERT INTO mcp_oauth_refresh_tokens
      (token_hash, grant_id, client_id, family_id, scope, resource, expires_at)
    VALUES
      (${token.hash}, ${token.grantId}, ${token.clientId}, ${token.familyId}, ${token.scope},
       ${token.resource}, ${token.expiresAt})
  `;
}

function serverError(message) {
  const error = new Error(message);
  error.statusCode = 503;
  return error;
}
