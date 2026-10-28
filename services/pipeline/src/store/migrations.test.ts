import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applyMigrations } from './migrations';
import { createTestDatabase } from './pglite';
import type { SqlClient } from './sql';

const TOKEN = 'ExponentPushToken[abcdefghijklmnop]';

describe('supabase migrations', () => {
  let client: SqlClient;
  let asAnon: <T>(fn: () => Promise<T>) => Promise<T>;

  let reset: () => Promise<void>;

  beforeAll(async () => {
    const test = await createTestDatabase();
    client = test.client;
    reset = test.reset;
    asAnon = async (fn) => {
      await test.db.exec('set role anon');
      try {
        return await fn();
      } finally {
        await test.db.exec('reset role');
      }
    };
  }, 60_000);
  beforeEach(() => reset());
  afterAll(() => client?.end());

  it('applies cleanly and only once', async () => {
    expect(await applyMigrations(client)).toEqual([]);
    const tables = await client.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public' order by 1",
    );
    expect(tables.map((t) => t.tablename)).toEqual([
      'articles',
      'cards',
      'clusters',
      'pipeline_meta',
      'pipeline_migrations',
      'push_log',
      'push_tokens',
      'source_state',
    ]);
  });

  it('enables row level security on every table', async () => {
    const rows = await client.query<{ relname: string }>(
      "select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity",
    );
    expect(rows).toEqual([]);
  });

  it('lets the app (anon) insert a push token and nothing else', async () => {
    await asAnon(() =>
      client.query("insert into public.push_tokens (token, platform) values ($1, 'android')", [
        TOKEN,
      ]),
    );
    expect(await client.query('select token from public.push_tokens')).toEqual([{ token: TOKEN }]);

    await expect(asAnon(() => client.query('select * from public.push_tokens'))).rejects.toThrow(
      /permission denied/,
    );
    await expect(asAnon(() => client.query('select * from public.cards'))).rejects.toThrow(
      /permission denied/,
    );
    await expect(asAnon(() => client.query('delete from public.push_tokens'))).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      asAnon(() => client.query("insert into public.clusters values ('k', 'h', 5, now())")),
    ).rejects.toThrow(/permission denied/);
  });

  it('rejects malformed push tokens', async () => {
    await expect(
      asAnon(() =>
        client.query(
          "insert into public.push_tokens (token, platform) values ('not-a-token', 'ios')",
        ),
      ),
    ).rejects.toThrow(/check constraint/);
    await expect(
      asAnon(() =>
        client.query("insert into public.push_tokens (token, platform) values ($1, 'windows')", [
          TOKEN,
        ]),
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it('enforces card constraints', async () => {
    await client.query("insert into public.clusters values ('k1', repeat('a', 64), 5, now())");
    const insert = (overrides: Record<string, unknown>) => {
      const card = {
        id: 'c1',
        cluster_id: 'k1',
        headline: 'H',
        summary: 'S',
        category: 'models',
        importance: 5,
        source_name: 'Lab',
        source_url: 'https://lab.example.com/a',
        image_url: null,
        published_at: new Date().toISOString(),
        llm_provider: 'gemini',
        prompt_version: 'v1',
        ...overrides,
      };
      const keys = Object.keys(card);
      return client.query(
        `insert into public.cards (${keys.join(', ')}) values (${keys.map((_, i) => `$${i + 1}`).join(', ')})`,
        Object.values(card),
      );
    };
    await expect(insert({ category: 'gossip' })).rejects.toThrow(/check constraint/);
    await expect(insert({ importance: 11 })).rejects.toThrow(/check constraint/);
    await expect(insert({ source_url: 'javascript:alert(1)' })).rejects.toThrow(/check constraint/);
    await expect(insert({})).resolves.toEqual([]);
  });
});
