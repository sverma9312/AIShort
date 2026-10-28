import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryStore } from './memoryStore';
import type { CardRecord } from './types';

const card = (overrides: Partial<CardRecord> = {}): CardRecord => ({
  id: 'c_1',
  clusterId: 'k_1',
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
  llmProvider: 'offline',
  promptVersion: 'v1',
  ...overrides,
});

describe('MemoryStore', () => {
  it('round-trips through a JSON file and starts empty when the file is missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aishort-store-'));
    const path = join(dir, 'nested', 'store.json');

    const empty = await MemoryStore.load(path);
    expect(await empty.findSeen(['h1'])).toEqual(new Set());

    await empty.saveSourceState('lab', { etag: '"v1"', consecutiveFailures: 0 });
    await empty.saveCard(card());
    await empty.save(path);

    const loaded = await MemoryStore.load(path);
    expect(await loaded.getSourceState('lab')).toEqual({ etag: '"v1"', consecutiveFailures: 0 });
    expect(await loaded.getCardByCluster('k_1')).toMatchObject({ id: 'c_1' });
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ version: 1 });
  });

  it('returns copies so callers cannot mutate stored records', async () => {
    const store = new MemoryStore();
    await store.saveCard(card());
    const copy = await store.getCardByCluster('k_1');
    copy!.hidden = true;
    expect((await store.getCardByCluster('k_1'))?.hidden).toBe(false);
  });
});
