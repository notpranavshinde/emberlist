CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
    client_id TEXT PRIMARY KEY,
    client_name TEXT NOT NULL,
    redirect_uris JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    disabled_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS mcp_oauth_authorization_requests (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL REFERENCES mcp_oauth_clients(client_id),
    redirect_uri TEXT NOT NULL,
    state TEXT NOT NULL,
    scope TEXT NOT NULL,
    offline_access BOOLEAN NOT NULL DEFAULT FALSE,
    resource TEXT NOT NULL,
    code_challenge TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    approved_at TIMESTAMPTZ,
    denied_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mcp_oauth_grants (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL REFERENCES mcp_oauth_clients(client_id),
    account_id TEXT NOT NULL,
    encrypted_google_refresh_token TEXT,
    time_zone TEXT NOT NULL,
    scope TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS mcp_oauth_grants_account_idx
    ON mcp_oauth_grants (account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS mcp_oauth_codes (
    code_hash TEXT PRIMARY KEY,
    grant_id TEXT NOT NULL REFERENCES mcp_oauth_grants(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL REFERENCES mcp_oauth_clients(client_id),
    redirect_uri TEXT NOT NULL,
    code_challenge TEXT NOT NULL,
    scope TEXT NOT NULL,
    offline_access BOOLEAN NOT NULL DEFAULT FALSE,
    resource TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS mcp_oauth_access_tokens (
    token_hash TEXT PRIMARY KEY,
    grant_id TEXT NOT NULL REFERENCES mcp_oauth_grants(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL REFERENCES mcp_oauth_clients(client_id),
    scope TEXT NOT NULL,
    resource TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS mcp_oauth_access_tokens_grant_idx
    ON mcp_oauth_access_tokens (grant_id);

CREATE TABLE IF NOT EXISTS mcp_oauth_refresh_tokens (
    token_hash TEXT PRIMARY KEY,
    grant_id TEXT NOT NULL REFERENCES mcp_oauth_grants(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL REFERENCES mcp_oauth_clients(client_id),
    family_id TEXT NOT NULL,
    scope TEXT NOT NULL,
    resource TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS mcp_oauth_refresh_tokens_grant_idx
    ON mcp_oauth_refresh_tokens (grant_id);

CREATE TABLE IF NOT EXISTS mcp_mutations (
    grant_id TEXT NOT NULL REFERENCES mcp_oauth_grants(id) ON DELETE CASCADE,
    mutation_id_hash TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'completed')),
    result_identifiers JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (grant_id, mutation_id_hash)
);

CREATE TABLE IF NOT EXISTS mcp_security_audit_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_name TEXT NOT NULL,
    client_id TEXT,
    grant_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS mcp_security_audit_events_created_idx
    ON mcp_security_audit_events (created_at);
