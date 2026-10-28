/**
 * Applies pending database migrations to DATABASE_URL.
 *
 *   pnpm db:migrate
 */
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDotEnv } from './config/dotenv';
import { loadEnv } from './config/env';
import { applyMigrations } from './store/migrations';
import { createPostgresClient } from './store/sql';

loadDotEnv(join(fileURLToPath(new URL('..', import.meta.url)), '.env'));
const env = loadEnv();
if (!env.DATABASE_URL) {
  process.stderr.write(
    'ERROR DATABASE_URL is not set (services/pipeline/.env or the environment).\n',
  );
  process.exit(1);
}
const client = createPostgresClient(env.DATABASE_URL);
try {
  const applied = await applyMigrations(client);
  process.stdout.write(
    applied.length ? `Applied: ${applied.join(', ')}\n` : 'Database is up to date.\n',
  );
} catch (error) {
  process.stderr.write(`ERROR ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  await client.end();
}
