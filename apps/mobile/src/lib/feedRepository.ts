import { FeedSchema, type Card } from '@aishort/shared';
import { z } from 'zod';
import { fetchLatestFeed, type FetchFn } from './feedClient';
import { readJson, STORAGE_KEYS, writeJson, type KeyValueStore } from './storage';

export const FeedSnapshotSchema = z.object({
  feed: FeedSchema,
  etag: z.string().optional(),
  baseUrl: z.string(),
  /** When the app last confirmed this is the newest feed (200 or 304). */
  checkedAt: z.string(),
});
export type FeedSnapshot = z.infer<typeof FeedSnapshotSchema>;

export function loadSnapshot(store: KeyValueStore): Promise<FeedSnapshot | undefined> {
  return readJson(store, STORAGE_KEYS.feed, FeedSnapshotSchema);
}

export interface RefreshResult {
  snapshot: FeedSnapshot;
  changed: boolean;
  /** Ids that weren't in the previous snapshot. */
  newCardIds: string[];
}

/**
 * Revalidates the cached feed and persists the result. Throws FeedUnavailableError when no URL
 * works; the caller keeps showing the cached snapshot in that case.
 */
export async function refreshSnapshot(params: {
  store: KeyValueStore;
  baseUrls: readonly string[];
  previous?: FeedSnapshot;
  fetch?: FetchFn;
  now?: Date;
}): Promise<RefreshResult> {
  const { store, baseUrls, previous } = params;
  const checkedAt = (params.now ?? new Date()).toISOString();
  const result = await fetchLatestFeed({
    baseUrls,
    ...(previous
      ? { cached: { baseUrl: previous.baseUrl, ...(previous.etag ? { etag: previous.etag } : {}) } }
      : {}),
    ...(params.fetch ? { fetch: params.fetch } : {}),
  });

  if (result.status === 'not-modified' && previous) {
    const snapshot = { ...previous, checkedAt };
    await writeJson(store, STORAGE_KEYS.feed, snapshot);
    return { snapshot, changed: false, newCardIds: [] };
  }
  if (result.status === 'not-modified') {
    // 304 without a cache can't happen unless the server misbehaves: fetch fresh.
    return refreshSnapshot({ ...params, previous: undefined });
  }

  const snapshot: FeedSnapshot = {
    feed: result.feed,
    baseUrl: result.baseUrl,
    checkedAt,
    ...(result.etag ? { etag: result.etag } : {}),
  };
  await writeJson(store, STORAGE_KEYS.feed, snapshot);
  const before = new Set(previous?.feed.cards.map((c) => c.id) ?? []);
  return {
    snapshot,
    changed: true,
    newCardIds: previous ? result.feed.cards.filter((c) => !before.has(c.id)).map((c) => c.id) : [],
  };
}

export function findCard(cards: readonly Card[], id: string): Card | undefined {
  return cards.find((card) => card.id === id);
}
