# Emberlist Web

The Emberlist web client is a React and TypeScript offline-first task app. It stores the local workspace in IndexedDB and optionally syncs the shared `SyncPayload` through Google Drive `appDataFolder` using serverless API endpoints in `api/`.

See the [root README](../README.md) for product features, Android setup, architecture, privacy behavior, and release links.

## Commands

```bash
npm ci
npm run dev
npm run lint
npm test
npm run security:check
npm run build
```

## Configuration

Client build variable:

```dotenv
VITE_GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
```

Server-side OAuth variables:

```dotenv
GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-web-client-secret
EMBERLIST_AUTH_SECRET=at-least-32-random-bytes
EMBERLIST_APP_ORIGIN=http://localhost:3000
```

Optional distributed rate limiting:

```dotenv
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

`npm run dev` starts Vite. OAuth and Drive endpoints require a local runtime capable of serving the functions in `api/`, such as Vercel's development runtime.

## Deployment

`vercel.json` defines the SPA rewrite and production security headers. Deploy with this directory as the project root and `dist/` as the output directory.

Before production activation:

1. Set all client and server environment variables.
2. Set `EMBERLIST_APP_ORIGIN` to the exact HTTPS application origin.
3. Register `/api/auth/google/callback` on the Google web OAuth client.
4. Run `npm audit --audit-level=high`, `npm run lint`, `npm test`, `npm run security:check`, and `npm run build`.

Security architecture, threat modeling, incident response, and launch documents are in [`docs/security/`](docs/security/).
