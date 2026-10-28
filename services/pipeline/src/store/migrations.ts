import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SqlClient } from './sql';

export const MIGRATIONS_DIR = fileURLToPath(
  new URL('../../../../supabase/migrations/', import.meta.url),
);

/**
 * Applies pending migrations in name order, each in a transaction, recording them in
 * pipeline_migrations. Returns the names applied this time.
 */
export async function applyMigrations(client: SqlClient, dir = MIGRATIONS_DIR): Promise<string[]> {
  await client.exec(
    'create table if not exists public.pipeline_migrations (name text primary key, applied_at timestamptz not null default now());' +
      'alter table public.pipeline_migrations enable row level security;',
  );
  const applied = new Set(
    (await client.query<{ name: string }>('select name from public.pipeline_migrations')).map(
      (r) => r.name,
    ),
  );
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

  const newlyApplied: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(join(dir, file), 'utf8');
    await client.execInTransaction(
      `${sql}\ninsert into public.pipeline_migrations (name) values ('${file.replace(/'/g, "''")}');`,
    );
    newlyApplied.push(file);
  }
  return newlyApplied;
}
