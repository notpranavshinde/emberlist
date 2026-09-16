# Emberlist Web

React and TypeScript client for Emberlist. Google access is mandatory for workspace routes. IndexedDB is an account-bound cache, and changes automatically sync with Android through Google Drive `appDataFolder`.

Product information and Android setup are in the [root README](../README.md).

## Run locally

```bash
npm ci
npm run dev
```

Google sign-in, Drive sync, and the remote MCP server require a local runtime that serves the functions in `api/`. The MCP and shared Drive handlers under `server/` are imported by `api/drive/sync-file.js`; they are not separate Vercel functions.

```dotenv
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
EMBERLIST_AUTH_SECRET=at-least-32-random-bytes
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
EMBERLIST_MCP_AUTH_SECRET=a-different-32-byte-random-secret
EMBERLIST_MCP_ENABLED=false
CRON_SECRET=another-random-secret
ANALYTICS_ID_SECRET=a-different-32-byte-random-secret
EMBERLIST_ADMIN_AUTH_SECRET=another-32-byte-random-secret
EMBERLIST_ANALYTICS_ADMIN_EMAILS=admin@example.com
EMBERLIST_APP_ORIGIN=http://localhost:3000
```

Optional distributed rate limiting:

```dotenv
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

The private aggregate dashboard is served at `/#/stats` without initializing the task workspace. Its OAuth callback is `/api/admin/auth/google/callback` and must be registered separately from the Drive callback. `npm run analytics:report -- YYYY-MM-DD YYYY-MM-DD` prints the same core operational metrics directly from Redis.

The remote MCP endpoint is `/api/mcp`. `vercel.json` rewrites its public OAuth, grant-management, cleanup, and Streamable HTTP routes into `api/drive/sync-file.js`, which dispatches to `server/mcp/`. Protected-resource and authorization-server metadata support OAuth discovery, and `/api/mcp/oauth/google/callback` must be registered on the existing Google web OAuth client. MCP grant and token metadata is stored in Postgres; task content remains in the user's Drive workspace and is never persisted in Postgres or logs.

Run `npm run db:migrate` after setting `DATABASE_URL`, and keep the staged default `EMBERLIST_MCP_ENABLED=false` until migrations, callback registration, metadata, and disabled health behavior are verified. Production should pin `EMBERLIST_APP_ORIGIN=https://emberlist.dev` and use Upstash for distributed rate limits. Vercel calls `GET /api/internal/mcp-cleanup` daily with `CRON_SECRET`; an authenticated `DELETE` to that route deletes every MCP grant during rollback without revoking the Google authorization shared with web sync.

The public [Codex plugin page](https://emberlist.dev/plugin) documents repository installation. Disclosures are available at [Privacy](https://emberlist.dev/privacy) and [Terms](https://emberlist.dev/terms). Contact `support@emberlist.dev` for security or privacy questions.

## Verify

```bash
npm audit --audit-level=high
npm run lint
npm test
npm run security:check
npm run build
```

`vercel.json` contains the SPA rewrite and HTTP security headers. Security documentation is in [`docs/security/`](docs/security/).
