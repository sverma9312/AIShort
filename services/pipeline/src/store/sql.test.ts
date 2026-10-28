import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations } from './migrations';
import { createPostgresClient, type SqlClient } from './sql';

/** The production driver applies migrations transactionally over a real TCP connection. */
describe('createPostgresClient + applyMigrations', () => {
  let db: PGlite;
  let server: PGLiteSocketServer;
  let client: SqlClient;

  beforeAll(async () => {
    db = await PGlite.create({ extensions: { pg_trgm } });
    await db.exec('create role anon nologin; create role authenticated nologin;');
    server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1' });
    await server.start();
    client = createPostgresClient(
      `postgres://postgres:postgres@${server.getServerConn()}/postgres`,
    );
  }, 60_000);

  afterAll(async () => {
    await client.end();
    await server.stop();
    await db.close();
  });

  it('applies every migration once', async () => {
    expect((await applyMigrations(client)).length).toBeGreaterThan(0);
    expect(await applyMigrations(client)).toEqual([]);
  });

  it('rolls back a failing migration completely', async () => {
    const dir = await import('node:fs/promises').then(async (fs) => {
      const tmp = await fs.mkdtemp(
        (await import('node:path')).join((await import('node:os')).tmpdir(), 'aishort-mig-'),
      );
      await fs.writeFile(
        `${tmp}/0001_bad.sql`,
        'create table public.half_done (id int);\nselect * from does_not_exist;',
      );
      return tmp;
    });
    await expect(applyMigrations(client, dir)).rejects.toThrow(/does_not_exist/);
    expect(await client.query("select to_regclass('public.half_done') as t")).toEqual([
      { t: null },
    ]);
  });
});
