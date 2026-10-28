import { mkdtemp, readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FeedSchema, MetaSchema } from '@aishort/shared';
import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../store/memoryStore';
import type { CardRecord } from '../store/types';
import { buildSite, writeSite } from './buildSite';

const now = new Date('2026-10-28T10:00:00Z');
const card = (
  id: string,
  publishedAt: string,
  overrides: Partial<CardRecord> = {},
): CardRecord => ({
  id,
  clusterId: `k_${id}`,
  headline: `Headline ${id}`,
  summary: 'A summary that is short.',
  category: 'models',
  importance: 5,
  sourceName: 'Lab',
  sourceUrl: `https://lab.example.com/${id}`,
  imageUrl: null,
  publishedAt,
  hidden: false,
  createdAt: '2026-10-28T09:00:00.000Z',
  llmProvider: 'gemini',
  promptVersion: 'summarize-v1',
  ...overrides,
});

async function storeWith(cards: CardRecord[]) {
  const store = new MemoryStore();
  for (const c of cards) await store.saveCard(c);
  return store;
}

describe('buildSite', () => {
  it('builds latest, daily archives and meta, all schema-valid', async () => {
    const store = await storeWith([
      card('a', '2026-10-28T08:00:00.000Z'),
      card('b', '2026-10-27T08:00:00.000Z'),
      card('hidden', '2026-10-28T09:00:00.000Z', { hidden: true }),
      card('ancient', '2026-08-01T08:00:00.000Z'),
    ]);
    const files = await buildSite(store, {
      now,
      feedBaseUrls: ['https://example.github.io/AIShort'],
    });

    expect([...files.keys()].sort()).toEqual([
      'v1/feed/archive/2026-10-27.json',
      'v1/feed/archive/2026-10-28.json',
      'v1/feed/latest.json',
      'v1/meta.json',
    ]);
    const latest = FeedSchema.parse(JSON.parse(files.get('v1/feed/latest.json')!));
    expect(latest.generatedAt).toBe(now.toISOString());
    expect(latest.cards.map((c) => c.id)).toEqual(['a', 'b']);
    expect(MetaSchema.parse(JSON.parse(files.get('v1/meta.json')!)).feedBaseUrls).toEqual([
      'https://example.github.io/AIShort',
    ]);
  });

  it('publishes only contract fields', async () => {
    const files = await buildSite(await storeWith([card('a', '2026-10-28T08:00:00.000Z')]), {
      now,
      feedBaseUrls: ['https://x.example.com'],
    });
    const published = (
      JSON.parse(files.get('v1/feed/latest.json')!) as { cards: Record<string, unknown>[] }
    ).cards[0]!;
    for (const internal of ['hidden', 'clusterId', 'llmProvider', 'promptVersion', 'createdAt']) {
      expect(published).not.toHaveProperty(internal);
    }
  });

  it('caps latest.json', async () => {
    const cards = Array.from({ length: 5 }, (_, i) => card(`c${i}`, `2026-10-28T0${i}:00:00.000Z`));
    const files = await buildSite(await storeWith(cards), {
      now,
      feedBaseUrls: ['https://x.example.com'],
      latestLimit: 3,
    });
    expect(
      (JSON.parse(files.get('v1/feed/latest.json')!) as { cards: unknown[] }).cards,
    ).toHaveLength(3);
  });

  it('refuses to publish invalid data', async () => {
    const store = await storeWith([
      card('a', '2026-10-28T08:00:00.000Z', { sourceUrl: 'javascript:alert(1)' }),
    ]);
    await expect(
      buildSite(store, { now, feedBaseUrls: ['https://x.example.com'] }),
    ).rejects.toThrow();
    await expect(buildSite(new MemoryStore(), { now, feedBaseUrls: [] })).rejects.toThrow();
  });
});

describe('writeSite', () => {
  it('writes files and removes stale feed files from earlier runs', async () => {
    const out = await mkdtemp(join(tmpdir(), 'aishort-site-'));
    await mkdir(join(out, 'v1', 'feed', 'archive'), { recursive: true });
    await writeFile(join(out, 'v1', 'feed', 'archive', '2020-01-01.json'), '{}');

    await writeSite(out, new Map([['v1/meta.json', '{"ok":true}\n']]));
    expect(await readFile(join(out, 'v1', 'meta.json'), 'utf8')).toBe('{"ok":true}\n');
    expect(await readdir(join(out, 'v1'))).toEqual(['meta.json']);
  });
});
