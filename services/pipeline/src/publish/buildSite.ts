import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  CATEGORIES,
  FEED_PATHS,
  FEED_VERSION,
  FeedSchema,
  MetaSchema,
  type Card,
  type Feed,
} from '@aishort/shared';
import { hoursBefore } from '../lib/time';
import type { CardRecord, Store } from '../store/types';

export interface SiteOptions {
  now: Date;
  feedBaseUrls: string[];
  minAppVersion?: string;
  latestLimit?: number;
  archiveDays?: number;
}

/**
 * Builds every published file from the store: latest.json, one archive file per UTC day,
 * and meta.json. Everything is validated with the shared schemas; invalid output throws, so a
 * bad run can never replace a good feed.
 */
export async function buildSite(store: Store, options: SiteOptions): Promise<Map<string, string>> {
  const { now, latestLimit = 100, archiveDays = 30 } = options;
  const generatedAt = now.toISOString();
  const cards = await store.listVisibleCards(hoursBefore(now, archiveDays * 24).toISOString());
  const files = new Map<string, string>();

  const feed = (list: CardRecord[]): Feed =>
    FeedSchema.parse({ version: FEED_VERSION, generatedAt, cards: list.map(toPublicCard) });
  files.set(FEED_PATHS.latest, json(feed(cards.slice(0, latestLimit))));

  const byDay = new Map<string, CardRecord[]>();
  for (const card of cards) {
    const day = card.publishedAt.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), card]);
  }
  for (const [day, list] of byDay) files.set(FEED_PATHS.archive(day), json(feed(list)));

  files.set(
    FEED_PATHS.meta,
    json(
      MetaSchema.parse({
        version: FEED_VERSION,
        minAppVersion: options.minAppVersion ?? '1.0.0',
        feedBaseUrls: options.feedBaseUrls,
        categories: [...CATEGORIES],
      }),
    ),
  );
  return files;
}

/** Writes the site to `outDir`, replacing any previous feed files there. */
export async function writeSite(outDir: string, files: Map<string, string>): Promise<void> {
  await rm(join(outDir, 'v1'), { recursive: true, force: true });
  for (const [path, content] of files) {
    const target = join(outDir, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
}

/** Only contract fields are published — internal fields (hidden, provider, …) never leave the store. */
function toPublicCard(card: CardRecord): Card {
  return {
    id: card.id,
    headline: card.headline,
    summary: card.summary,
    category: card.category,
    importance: card.importance,
    sourceName: card.sourceName,
    sourceUrl: card.sourceUrl,
    imageUrl: card.imageUrl,
    publishedAt: card.publishedAt,
  };
}

function json(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}
