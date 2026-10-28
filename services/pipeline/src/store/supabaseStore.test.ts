import { describe, expect, it } from 'vitest';
import { SupabaseStore, iso } from './supabaseStore';

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
}

function fake(responses: Record<string, unknown>) {
  const calls: Call[] = [];
  const fetch = (url: string, init?: RequestInit) => {
    calls.push({
      method: init?.method ?? 'GET',
      url,
      headers: init?.headers as Record<string, string>,
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    });
    const key = Object.keys(responses).find((k) => url.includes(k));
    const body = key ? responses[key] : [];
    return Promise.resolve(
      body instanceof Response ? body : new Response(JSON.stringify(body), { status: 200 }),
    );
  };
  return {
    store: new SupabaseStore({ url: 'https://p.supabase.co/', serviceRoleKey: 'srk', fetch }),
    calls,
  };
}

describe('SupabaseStore', () => {
  it('authenticates with the service-role key and upserts', async () => {
    const { store, calls } = fake({});
    await store.saveSourceState('lab', { etag: '"v1"', consecutiveFailures: 0 });
    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: 'https://p.supabase.co/rest/v1/source_state?on_conflict=source_id',
      headers: {
        apikey: 'srk',
        Authorization: 'Bearer srk',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: [
        {
          source_id: 'lab',
          etag: '"v1"',
          last_modified: null,
          last_ok_at: null,
          last_error: null,
          consecutive_failures: 0,
        },
      ],
    });
  });

  it('maps source state rows back, dropping nulls', async () => {
    const { store } = fake({
      source_state: [
        {
          source_id: 'lab',
          etag: '"v1"',
          last_modified: null,
          last_ok_at: '2026-10-28T08:00:00+00:00',
          last_error: null,
          consecutive_failures: 2,
        },
      ],
    });
    expect(await store.getSourceState('lab')).toEqual({
      etag: '"v1"',
      lastOkAt: '2026-10-28T08:00:00.000Z',
      consecutiveFailures: 2,
    });
  });

  it('checks seen hashes in chunks of 100', async () => {
    const { store, calls } = fake({ articles: [{ url_hash: 'h1' }] });
    const hashes = Array.from({ length: 150 }, (_, i) => `h${i}`);
    expect(await store.findSeen(hashes)).toEqual(new Set(['h1']));
    expect(calls).toHaveLength(2);
    expect(calls[0]?.url).toContain('url_hash=in.(h0,h1,');
  });

  it('re-scores pg_trgm candidates with the pipeline similarity (number guard)', async () => {
    const { store } = fake({
      'rpc/similar_clusters': [
        { cluster_id: 'k7', title: 'Introducing GPT-7', similarity: 0.9 },
        { cluster_id: 'k6', title: 'OpenAI introducing GPT-6 today', similarity: 0.6 },
      ],
      'clusters?id=eq.k6': [
        {
          id: 'k6',
          primary_url_hash: 'h',
          primary_weight: 10,
          first_seen_at: '2026-10-28T08:00:00+00:00',
        },
      ],
    });
    const match = await store.findSimilarCluster('Introducing GPT-6', '2026-10-27T00:00:00Z', 0.4);
    expect(match?.cluster).toMatchObject({
      id: 'k6',
      primaryWeight: 10,
      firstSeenAt: '2026-10-28T08:00:00.000Z',
    });
  });

  it('lists visible cards with UTC timestamps', async () => {
    const { store, calls } = fake({
      cards: [
        {
          id: 'c',
          cluster_id: 'k',
          headline: 'H',
          summary: 'S',
          category: 'models',
          importance: 5,
          source_name: 'Lab',
          source_url: 'https://a.example.com',
          image_url: null,
          published_at: '2026-10-28T08:00:00+00:00',
          hidden: false,
          created_at: '2026-10-28T09:00:00+00:00',
          llm_provider: 'gemini',
          prompt_version: 'v1',
        },
      ],
    });
    const [card] = await store.listVisibleCards('2026-10-01T00:00:00.000Z');
    expect(card).toMatchObject({
      id: 'c',
      publishedAt: '2026-10-28T08:00:00.000Z',
      imageUrl: null,
    });
    expect(calls[0]?.url).toContain('hidden=is.false');
  });

  it('surfaces HTTP errors without the key', async () => {
    const { store } = fake({ cards: new Response('{"message":"bad"}', { status: 401 }) });
    const error = await store.listVisibleCards('x').catch((e: unknown) => (e as Error).message);
    expect(error).toMatch(/HTTP 401/);
    expect(error).not.toContain('srk');
  });

  it('normalizes Postgres timestamps', () => {
    expect(iso('2026-10-28 08:00:00+00')).toBe('2026-10-28T08:00:00.000Z');
    expect(iso(null)).toBeUndefined();
  });
});
