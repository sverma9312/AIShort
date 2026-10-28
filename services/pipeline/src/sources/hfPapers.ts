import { z } from 'zod';
import { collapseWhitespace } from '../lib/text';
import { toIsoUtc } from '../lib/time';
import { toWebUrl } from '../lib/url';
import type { FeedItem } from './rss';

export const HF_DAILY_PAPERS_URL = 'https://huggingface.co/api/daily_papers';

const HfResponseSchema = z.array(
  z.object({
    paper: z.object({
      id: z.string().min(1),
      title: z.string(),
      summary: z.string().nullish(),
      upvotes: z.number().nullish(),
      publishedAt: z.string().nullish(),
    }),
    publishedAt: z.string().nullish(),
    thumbnail: z.string().nullish(),
  }),
);

export interface HfPaperItem extends FeedItem {
  points: number;
}

/** Parses the Hugging Face Daily Papers API (curated research papers with community upvotes). */
export function parseHfPapers(json: unknown): HfPaperItem[] {
  return HfResponseSchema.parse(json).flatMap(({ paper, publishedAt, thumbnail }) => {
    const title = collapseWhitespace(paper.title);
    if (!title) return [];
    const item: HfPaperItem = {
      url: `https://huggingface.co/papers/${encodeURIComponent(paper.id)}`,
      title,
      points: paper.upvotes ?? 0,
    };
    const description = paper.summary ? collapseWhitespace(paper.summary) : '';
    if (description) item.description = description;
    // When the paper was featured on Daily Papers, not when it was first posted to arXiv.
    const date = toIsoUtc(publishedAt ?? paper.publishedAt);
    if (date) item.publishedAt = date;
    const image = toWebUrl(thumbnail);
    if (image) item.imageUrl = image;
    return [item];
  });
}
