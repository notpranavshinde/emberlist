import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import postgres from 'postgres';
import {
  approveAuthorizationRequest,
  claimMutationReplay,
  cleanupMcpDatabase,
  consumeAuthorizationCodeAndIssue,
  createAuthorizationRequest,
  getRefreshToken,
  registerOAuthClient,
  revokeGrant,
  rotateRefreshToken,
  setMcpSqlForTests,
} from '../api/_lib/mcp-db.js';
import { decryptMcpSecret, encryptMcpSecret } from '../api/_lib/mcp-auth.js';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');

process.env.NODE_ENV = 'test';
const schema = `mcp_it_${crypto.randomUUID().replaceAll('-', '')}`;
assert.match(schema, /^mcp_it_[a-f0-9]{32}$/u);

const admin = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, onnotice: false });
let sql;
let schemaCreated = false;

try {
  if (process.env.EXPECTED_NEON_BRANCH_ID) {
    const [branch] = await admin.unsafe("SELECT current_setting('neon.branch_id', true) AS id");
    if (branch.id !== process.env.EXPECTED_NEON_BRANCH_ID) {
      throw new Error('DATABASE_URL is not the expected disposable Neon branch.');
    }
  }
  await admin`CREATE SCHEMA ${admin(schema)}`;
  schemaCreated = true;
  const integrationUrl = new URL(process.env.DATABASE_URL);
  integrationUrl.hostname = integrationUrl.hostname.replace('-pooler.', '.');
  sql = postgres(integrationUrl.toString(), {
    max: 4,
    prepare: false,
    onnotice: false,
    connection: {
      application_name: 'emberlist-mcp-integration-test',
      options: `-c search_path=${schema}`,
    },
  });
  const [current] = await sql`SELECT current_schema() AS name`;
  assert.equal(current.name, schema, 'Disposable schema search_path was not applied.');

  const migration = await fs.readFile(new URL('../db/001_mcp_oauth.sql', import.meta.url), 'utf8');
  await sql.unsafe(migration);
  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = ${schema} AND table_name LIKE 'mcp_%'
  `;
  assert.equal(tables.length, 8, 'Migration did not create every MCP table.');

  setMcpSqlForTests(sql);
  const ids = {
    client: `client-${crypto.randomUUID()}`,
    request: crypto.randomUUID(),
    grant: crypto.randomUUID(),
    code: crypto.randomBytes(32).toString('hex'),
  };
  const rawGoogleRefreshToken = `google-${crypto.randomBytes(24).toString('base64url')}`;
  const encryptionSecret = crypto.randomBytes(32).toString('base64url');
  const encryptedGoogleRefreshToken = encryptMcpSecret(rawGoogleRefreshToken, encryptionSecret);

  await registerOAuthClient({
    clientId: ids.client,
    clientName: 'MCP integration test',
    redirectUris: ['http://127.0.0.1/callback'],
  });
  await createAuthorizationRequest({
    id: ids.request,
    clientId: ids.client,
    redirectUri: 'http://127.0.0.1/callback',
    state: 'state',
    scope: 'emberlist.workspace',
    offlineAccess: true,
    resource: 'https://emberlist.test/api/mcp',
    codeChallenge: 'challenge',
    expiresAt: future(5),
  });
  await approveAuthorizationRequest({
    requestId: ids.request,
    grant: {
      id: ids.grant,
      accountId: 'integration-account',
      encryptedGoogleRefreshToken,
      timeZone: 'UTC',
      expiresAt: future(60),
    },
    code: { hash: ids.code, expiresAt: future(5) },
  });

  const [storedGrant] = await sql`
    SELECT encrypted_google_refresh_token FROM mcp_oauth_grants WHERE id = ${ids.grant}
  `;
  assert.notEqual(storedGrant.encrypted_google_refresh_token, rawGoogleRefreshToken);
  assert.equal(decryptMcpSecret(storedGrant.encrypted_google_refresh_token, encryptionSecret), rawGoogleRefreshToken);

  const initial = records(ids, 'initial');
  const codeResults = await Promise.all([
    consumeAuthorizationCodeAndIssue(ids.code, initial.access, initial.refresh),
    consumeAuthorizationCodeAndIssue(ids.code, records(ids, 'duplicate').access, records(ids, 'duplicate').refresh),
  ]);
  assert.equal(codeResults.filter(Boolean).length, 1, 'Authorization code was consumed more than once.');

  const firstRotation = records(ids, 'rotation-a', initial.refresh.familyId);
  const secondRotation = records(ids, 'rotation-b', initial.refresh.familyId);
  const rotationResults = await Promise.all([
    rotateRefreshToken(initial.refresh.hash, firstRotation.access, firstRotation.refresh),
    rotateRefreshToken(initial.refresh.hash, secondRotation.access, secondRotation.refresh),
  ]);
  assert.equal(rotationResults.filter(Boolean).length, 1, 'Refresh rotation race issued more than one token pair.');
  assert.ok((await getRefreshToken(initial.refresh.hash)).consumed_at, 'Rotated refresh token was not retained for reuse detection.');

  await cleanupMcpDatabase();
  assert.ok(await getRefreshToken(initial.refresh.hash), 'Cleanup removed a consumed refresh token before its expiry.');

  await claimMutationReplay(ids.grant, 'mutation-hash', 'request-hash');
  await revokeGrant(ids.grant, 'integration-account');
  const [cascade] = await sql`
    SELECT
      (SELECT count(*)::int FROM mcp_oauth_codes WHERE grant_id = ${ids.grant}) AS codes,
      (SELECT count(*)::int FROM mcp_oauth_access_tokens WHERE grant_id = ${ids.grant}) AS access_tokens,
      (SELECT count(*)::int FROM mcp_oauth_refresh_tokens WHERE grant_id = ${ids.grant}) AS refresh_tokens,
      (SELECT count(*)::int FROM mcp_mutations WHERE grant_id = ${ids.grant}) AS mutations
  `;
  assert.deepEqual(cascade, { codes: 0, access_tokens: 0, refresh_tokens: 0, mutations: 0 });

  process.stdout.write('MCP Postgres integration passed: migration, encryption, one-time code, rotation race, retention, cascades.\n');
} finally {
  setMcpSqlForTests(null);
  if (sql) await sql.end({ timeout: 5 });
  if (schemaCreated) await admin`DROP SCHEMA ${admin(schema)} CASCADE`;
  await admin.end({ timeout: 5 });
}

function records(ids, label, familyId = crypto.randomUUID()) {
  return {
    access: {
      hash: `access-${label}-${crypto.randomUUID()}`,
      grantId: ids.grant,
      clientId: ids.client,
      scope: 'emberlist.workspace',
      resource: 'https://emberlist.test/api/mcp',
      expiresAt: future(10),
    },
    refresh: {
      hash: `refresh-${label}-${crypto.randomUUID()}`,
      grantId: ids.grant,
      clientId: ids.client,
      familyId,
      scope: 'emberlist.workspace',
      resource: 'https://emberlist.test/api/mcp',
      expiresAt: future(30),
    },
  };
}

function future(minutes) {
  return new Date(Date.now() + minutes * 60_000);
}
