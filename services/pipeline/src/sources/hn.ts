import { z } from 'zod';
import { toIsoUtc } from '../lib/time';
import { toWebUrl } from '../lib/url';
import type { FeedItem } from './rss';

export const HN_SEARCH_URL = 'https://hn.algolia.com/api/v1/search_by_date';

/** Stories from the last `windowHours` with at least `minPoints` points (Algolia HN API, no key). */
export function hnSearchUrl(now: Date, minPoints: number, windowHours = 48): string {
  const since = Math.floor(now.getTime() / 1000) - windowHours * 3600;
  const params = new URLSearchParams({
    tags: 'story',
    hitsPerPage: '200',
    numericFilters: `points>=${minPoints},created_at_i>${since}`,
  });
  return `${HN_SEARCH_URL}?${params.toString()}`;
}

const HnResponseSchema = z.object({
  hits: z.array(
    z.object({
      objectID: z.string(),
      title: z.string().nullish(),
      url: z.string().nullish(),
      points: z.number().nullish(),
      created_at: z.string().nullish(),
    }),
  ),
});

export interface HnItem extends FeedItem {
  points: number;
}

/** Parses Algolia results. Text-only posts (Ask HN, …) have no article URL and are skipped. */
export function parseHnResponse(json: unknown): HnItem[] {
  const items: HnItem[] = [];
  for (const hit of HnResponseSchema.parse(json).hits) {
    const url = toWebUrl(hit.url);
    const title = hit.title?.trim();
    if (!url || !title) continue;
    const publishedAt = toIsoUtc(hit.created_at);
    items.push({ url, title, points: hit.points ?? 0, ...(publishedAt ? { publishedAt } : {}) });
  }
  return items;
}
