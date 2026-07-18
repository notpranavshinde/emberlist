# Emberlist Web

React and TypeScript client for Emberlist. Workspace data is stored in IndexedDB and can optionally sync with the Android client through Google Drive `appDataFolder`.

Product information and Android setup are in the [root README](../README.md).

## Run locally

```bash
npm ci
npm run dev
```

Google sign-in and Drive sync require a local runtime that serves the functions in `api/`.

```dotenv
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
EMBERLIST_AUTH_SECRET=at-least-32-random-bytes
EMBERLIST_APP_ORIGIN=http://localhost:3000
```

Optional distributed rate limiting:

```dotenv
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

## Verify

```bash
npm audit --audit-level=high
npm run lint
npm test
npm run security:check
npm run build
```

`vercel.json` contains the SPA rewrite and HTTP security headers. Security documentation is in [`docs/security/`](docs/security/).
