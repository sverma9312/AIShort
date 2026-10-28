import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MemoryStore } from './memoryStore';
import { createTestDatabase, createWireTestDatabase } from './pglite';
import { SupabaseStore } from './supabaseStore';
import type { ArticleRecord, CardRecord, Store } from './types';

/** Every Store implementation must pass the same behavior tests. */
interface Harness {
  store: Store;
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

const implementations: [string, () => Promise<Harness>][] = [
  [
    'MemoryStore',
    () => {
      const harness: Harness = {
        store: new MemoryStore(),
        reset: () => {
          harness.store = new MemoryStore();
          return Promise.resolve();
        },
        close: () => Promise.resolve(),
      };
      return Promise.resolve(harness);
    },
  ],
  [
    'SupabaseStore (PGlite)',
    async () => {
      const { client, reset } = await createTestDatabase();
      return { store: new SupabaseStore(client), reset, close: () => client.end() };
    },
  ],
  [
    'SupabaseStore (postgres driver over TCP)',
    async () => {
      const { client, reset } = await createWireTestDatabase();
      return { store: new SupabaseStore(client), reset, close: () => client.end() };
    },
  ],
];

const hash = (n: number) => n.toString(16).padStart(64, '0');
const article = (n: number, overrides: Partial<ArticleRecord> = {}): ArticleRecord => ({
  urlHash: hash(n),
  urlCanonical: `https://a.example.com/${n}`,
  sourceId: 'lab',
  title: `Title ${n}`,
  fetchedAt: '2026-10-28T09:00:00.000Z',
  status: 'carded',
  ...overrides,
});
const card = (id: string, clusterId: string, overrides: Partial<CardRecord> = {}): CardRecord => ({
  id,
  clusterId,
  headline: 'Headline',
  summary: 'Summary',
  category: 'models',
  importance: 5,
  sourceName: 'Lab',
  sourceUrl: 'https://lab.example.com/a',
  imageUrl: null,
  publishedAt: '2026-10-28T08:00:00.000Z',
  hidden: false,
  createdAt: '2026-10-28T09:00:00.000Z',
  llmProvider: 'gemini',
  promptVersion: 'summarize-v1',
  ...overrides,
});
const cluster = (id: string, firstSeenAt = '2026-10-28T09:00:00.000Z', primaryWeight = 6) => ({
  id,
  primaryUrlHash: hash(1),
  primaryWeight,
  firstSeenAt,
  titles: [],
});

describe.each(implementations)('%s', (_name, create) => {
  let harness: Harness;
  let store: Store;
  beforeAll(async () => {
    harness = await create();
  }, 60_000);
  beforeEach(async () => {
    await harness.reset();
    store = harness.store;
  });
  afterAll(() => harness?.close());

  it('stores source state', async () => {
    expect(await store.getSourceState('lab')).toBeUndefined();
    await store.saveSourceState('lab', {
      etag: '"v1"',
      lastOkAt: '2026-10-28T09:00:00.000Z',
      consecutiveFailures: 0,
    });
    await store.saveSourceState('lab', {
      etag: '"v2"',
      lastOkAt: '2026-10-28T09:30:00.000Z',
      consecutiveFailures: 0,
    });
    expect(await store.getSourceState('lab')).toEqual({
      etag: '"v2"',
      lastOkAt: '2026-10-28T09:30:00.000Z',
      consecutiveFailures: 0,
    });
  });

  it('reports which articles were already processed', async () => {
    await store.saveArticles([article(1, { status: 'dropped', reason: 'too-old' })]);
    expect(await store.findSeen([hash(1), hash(2)])).toEqual(new Set([hash(1)]));
    expect(await store.findSeen([])).toEqual(new Set());
  });

  it('finds similar clusters within the time window', async () => {
    await store.saveCluster(cluster('k1'));
    await store.saveArticles([
      article(1, { title: 'OpenAI releases a new reasoning model', clusterId: 'k1' }),
    ]);

    const match = await store.findSimilarCluster(
      'OpenAI releases new reasoning model',
      '2026-10-28T00:00:00.000Z',
      0.5,
    );
    expect(match).toMatchObject({
      cluster: { id: 'k1', primaryWeight: 6, firstSeenAt: '2026-10-28T09:00:00.000Z' },
    });
    expect(match!.similarity).toBeGreaterThanOrEqual(0.5);
    expect(match!.cluster.titles).toContain('OpenAI releases a new reasoning model');

    expect(
      await store.findSimilarCluster(
        'OpenAI releases new reasoning model',
        '2026-10-29T00:00:00.000Z',
        0.5,
      ),
    ).toBeUndefined();
    expect(
      await store.findSimilarCluster('City approves bike lanes', '2026-10-28T00:00:00.000Z', 0.5),
    ).toBeUndefined();
  });

  it('applies the number guard when matching clusters', async () => {
    await store.saveCluster(cluster('k1'));
    await store.saveArticles([article(1, { title: 'Introducing GPT-6', clusterId: 'k1' })]);
    expect(
      await store.findSimilarCluster('Introducing GPT-7', '2026-10-28T00:00:00.000Z', 0.5),
    ).toBeUndefined();
  });

  it('updates a cluster primary', async () => {
    await store.saveCluster(cluster('k1'));
    await store.saveArticles([article(1, { title: 'Big model launch', clusterId: 'k1' })]);
    await store.saveCluster({ ...cluster('k1'), primaryUrlHash: hash(2), primaryWeight: 10 });
    const match = await store.findSimilarCluster(
      'Big model launch',
      '2026-10-28T00:00:00.000Z',
      0.5,
    );
    expect(match?.cluster).toMatchObject({ primaryUrlHash: hash(2), primaryWeight: 10 });
  });

  it('stores cards and lists visible ones newest first', async () => {
    for (const id of ['k1', 'k2', 'k3', 'k4']) await store.saveCluster(cluster(id));
    await store.saveCard(card('old', 'k1', { publishedAt: '2026-10-27T08:00:00.000Z' }));
    await store.saveCard(
      card('new', 'k2', {
        publishedAt: '2026-10-28T08:00:00.000Z',
        imageUrl: 'https://img.example.com/a.png',
      }),
    );
    await store.saveCard(card('hidden', 'k3', { hidden: true }));
    await store.saveCard(card('ancient', 'k4', { publishedAt: '2026-08-01T08:00:00.000Z' }));

    const visible = await store.listVisibleCards('2026-10-01T00:00:00.000Z');
    expect(visible.map((c) => c.id)).toEqual(['new', 'old']);
    expect(visible[0]).toEqual(
      card('new', 'k2', {
        publishedAt: '2026-10-28T08:00:00.000Z',
        imageUrl: 'https://img.example.com/a.png',
      }),
    );
    expect(await store.getCardByCluster('k1')).toMatchObject({ id: 'old' });
    expect(await store.getCardByCluster('missing')).toBeUndefined();
  });

  it('updates card attribution and the hidden flag', async () => {
    await store.saveCluster(cluster('k1'));
    await store.saveCard(card('c1', 'k1'));
    await store.saveCard(
      card('c1', 'k1', {
        sourceName: 'Primary Lab',
        sourceUrl: 'https://primary.example.com/x',
        hidden: true,
      }),
    );
    expect(await store.getCardByCluster('k1')).toMatchObject({
      sourceName: 'Primary Lab',
      hidden: true,
    });
    expect(await store.listVisibleCards('2026-10-01T00:00:00.000Z')).toEqual([]);
  });

  it('stores pipeline metadata', async () => {
    expect(await store.getMeta('alert')).toBeUndefined();
    await store.setMeta('alert', { sentAt: '2026-10-28T09:00:00.000Z', count: 2 });
    await store.setMeta('alert', { sentAt: '2026-10-28T10:00:00.000Z', count: 3 });
    expect(await store.getMeta('alert')).toEqual({ sentAt: '2026-10-28T10:00:00.000Z', count: 3 });
  });

  it('prunes old bookkeeping but keeps anything that became a card', async () => {
    await store.saveCluster(cluster('kept', '2026-09-01T00:00:00.000Z'));
    await store.saveCluster(cluster('stale', '2026-09-01T00:00:00.000Z'));
    await store.saveCard(card('c1', 'kept'));
    await store.saveArticles([
      article(1, { clusterId: 'kept', fetchedAt: '2026-09-01T00:00:00.000Z' }),
      article(2, { clusterId: 'stale', status: 'rejected', fetchedAt: '2026-09-01T00:00:00.000Z' }),
      article(3, { status: 'dropped', fetchedAt: '2026-09-01T00:00:00.000Z' }),
      article(4, { status: 'dropped', fetchedAt: '2026-10-28T00:00:00.000Z' }),
    ]);

    expect(await store.prune('2026-10-01T00:00:00.000Z')).toBe(2);
    expect(await store.findSeen([hash(1), hash(2), hash(3), hash(4)])).toEqual(
      new Set([hash(1), hash(4)]),
    );
    expect(await store.getCardByCluster('kept')).toBeDefined();
  });
});
