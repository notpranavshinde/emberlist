import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
const directory = path.resolve(import.meta.dirname, '../db');

try {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  const files = (await fs.readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
  for (const name of files) {
    const [applied] = await sql`SELECT name FROM schema_migrations WHERE name = ${name}`;
    if (applied) continue;
    const source = await fs.readFile(path.join(directory, name), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(source);
      await tx`INSERT INTO schema_migrations (name) VALUES (${name}) ON CONFLICT (name) DO NOTHING`;
    });
    process.stdout.write(`Applied ${name}\n`);
  }
} finally {
  await sql.end({ timeout: 5 });
}
