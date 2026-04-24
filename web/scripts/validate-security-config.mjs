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

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
if (!indexHtml.includes('Content-Security-Policy')) {
  console.error('index.html is missing a CSP declaration.');
  process.exit(1);
}

console.log('Security configuration docs and CSP presence validated.');
