import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { applyMigrations } from './migrations';
import { createPostgresClient, type SqlClient } from './sql';

/**
 * In-process Postgres (WebAssembly) with Supabase's client roles and every migration applied.
 * Used by tests so SQL, constraints and RLS are exercised without Docker or a Supabase project.
 */
export async function createTestDatabase(): Promise<{
  client: SqlClient;
  db: PGlite;
  reset: () => Promise<void>;
}> {
  const db = await PGlite.create({ extensions: { pg_trgm } });
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
  `);
  const client: SqlClient = {
    async query<T extends object>(text: string, params: readonly unknown[] = []) {
      return (await db.query<T>(text, [...params])).rows;
    },
    async exec(text: string) {
      await db.exec(text);
    },
    async execInTransaction(text: string) {
      await db.transaction(async (tx) => {
        await tx.exec(text);
      });
    },
    end: () => db.close(),
  };
  await applyMigrations(client);
  // Starting PGlite takes seconds, so tests share one database per file and reset between tests.
  const reset = async () => {
    await db.exec(
      'truncate public.source_state, public.clusters, public.articles, public.cards, public.push_tokens, public.push_log, public.pipeline_meta restart identity cascade',
    );
  };
  return { client, db, reset };
}

/**
 * Like createTestDatabase, but the returned client is the production `postgres` driver talking
 * to PGlite over TCP, so driver-specific behavior (parameter typing, transactions) is tested.
 */
export async function createWireTestDatabase(): Promise<{
  client: SqlClient;
  reset: () => Promise<void>;
}> {
  const { db, reset, client: direct } = await createTestDatabase();
  const server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1' });
  await server.start();
  const client = createPostgresClient(
    `postgres://postgres:postgres@${server.getServerConn()}/postgres`,
  );
  return {
    client: {
      ...client,
      end: async () => {
        await client.end();
        await server.stop();
        await direct.end();
      },
    },
    reset,
  };
}
