import postgres from 'postgres';

/** Minimal SQL interface: implemented by the `postgres` driver in production and PGlite in tests. */
export interface SqlClient {
  query<T extends object = Record<string, unknown>>(
    text: string,
    params?: readonly unknown[],
  ): Promise<T[]>;
  /** Runs several statements without parameters. */
  exec(text: string): Promise<void>;
  /** Runs several statements without parameters atomically, on a single connection. */
  execInTransaction(text: string): Promise<void>;
  end(): Promise<void>;
}

/**
 * Connects to Postgres (Supabase). Use the Supabase *pooler* connection string from CI.
 * Prepared statements are disabled so the transaction-mode pooler (port 6543) also works.
 */
export function createPostgresClient(url: string): SqlClient {
  const sql = postgres(url, {
    prepare: false,
    max: 4,
    idle_timeout: 20,
    connect_timeout: 15,
    onnotice: () => {},
  });
  return {
    async query<T extends object>(text: string, params: readonly unknown[] = []) {
      return (await sql.unsafe(
        text,
        params as postgres.ParameterOrJSON<never>[],
      )) as unknown as T[];
    },
    async exec(text: string) {
      await sql.unsafe(text);
    },
    async execInTransaction(text: string) {
      await sql.begin(async (tx) => {
        await tx.unsafe(text);
      });
    },
    end: () => sql.end({ timeout: 5 }),
  };
}
