import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../src/', import.meta.url));

function collect(dir) {
  const entries = readdirSync(dir);
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      files.push(...collect(full));
      continue;
    }
    if (full.endsWith('.ts') || full.endsWith('.tsx')) {
      files.push(full);
    }
  }
  return files;
}

const files = collect(root);
const violations = [];
for (const file of files) {
  if (basename(file) === 'webStorage.ts') continue;
  const content = readFileSync(file, 'utf8');
  const hasDirectUsage = /window\.localStorage|localStorage\.(getItem|setItem|removeItem)/.test(content);
  if (hasDirectUsage) violations.push(file);
}

if (violations.length) {
  console.error('Direct localStorage usage is only allowed in src/lib/webStorage.ts. Violations:');
  for (const v of violations) console.error(`- ${v}`);
  process.exit(1);
}

console.log('No direct localStorage usage found outside webStorage wrapper.');
