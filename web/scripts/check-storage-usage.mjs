import { globSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../src/', import.meta.url));

const files = globSync(['**/*.ts', '**/*.tsx'], { cwd: root }).map((file) => join(root, file));
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
