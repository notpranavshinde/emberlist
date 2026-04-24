import { readFileSync, existsSync } from 'node:fs';

const requiredDocs = [
  'docs/security/threat-model.md',
  'docs/security/headers.md',
  'docs/security/dependency-policy.md',
  'docs/security/test-matrix.md',
  'docs/security/incident-response.md',
  'docs/security/launch-checklist.md',
  'docs/security/adr-auth-architecture.md',
];

const missing = requiredDocs.filter((path) => !existsSync(new URL(`../${path}`, import.meta.url)));
if (missing.length) {
  console.error('Missing required security docs:');
  for (const path of missing) console.error(`- ${path}`);
  process.exit(1);
}

const vercelConfigPath = new URL('../vercel.json', import.meta.url);
if (!existsSync(vercelConfigPath)) {
  console.error('Missing web/vercel.json with required HTTP security headers.');
  process.exit(1);
}

const vercelConfig = JSON.parse(readFileSync(vercelConfigPath, 'utf8'));
const headerEntries = Array.isArray(vercelConfig.headers) ? vercelConfig.headers : [];
const flattenedHeaders = headerEntries.flatMap((entry) =>
  Array.isArray(entry?.headers)
    ? entry.headers.map((header) => ({
      source: typeof entry.source === 'string' ? entry.source : '',
      key: typeof header?.key === 'string' ? header.key : '',
      value: typeof header?.value === 'string' ? header.value : '',
    }))
    : []
);

const requiredHeaderNames = [
  'strict-transport-security',
  'x-content-type-options',
  'referrer-policy',
  'permissions-policy',
  'content-security-policy',
];

const missingHeaderNames = requiredHeaderNames.filter((name) =>
  !flattenedHeaders.some((header) => header.key.toLowerCase() === name)
);

if (missingHeaderNames.length) {
  console.error('vercel.json is missing required HTTP security headers:');
  for (const header of missingHeaderNames) console.error(`- ${header}`);
  process.exit(1);
}

const cspHeader = flattenedHeaders.find((header) => header.key.toLowerCase() === 'content-security-policy');
if (!cspHeader) {
  console.error('Missing Content-Security-Policy response header in vercel.json.');
  process.exit(1);
}

const requiredCspTokens = [
  "frame-ancestors 'none'",
  'frame-src https://accounts.google.com/gsi/',
  'script-src',
  'connect-src',
];

const missingCspTokens = requiredCspTokens.filter((token) => !cspHeader.value.includes(token));
if (missingCspTokens.length) {
  console.error('Content-Security-Policy header is missing required directives:');
  for (const token of missingCspTokens) console.error(`- ${token}`);
  process.exit(1);
}

const rootHeaderApplied = flattenedHeaders.some((header) => header.source === '/(.*)');
if (!rootHeaderApplied) {
  console.error('HTTP security headers must be applied to source /(.*) in vercel.json.');
  process.exit(1);
}

console.log('Security configuration docs and HTTP header configuration validated.');
