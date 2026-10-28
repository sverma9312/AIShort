import { z } from 'zod';
import {
  CATEGORIES,
  FEED_VERSION,
  HEADLINE_MAX_WORDS,
  IMPORTANCE_MAX,
  IMPORTANCE_MIN,
  SUMMARY_MAX_WORDS,
} from './constants';
import { countWords } from './words';

// Only http(s): these URLs are opened from the app, so `javascript:` and similar must never pass.
const webUrl = z.url({ protocol: /^https?$/ });

// Timestamps are always UTC ("...Z"), so ordering by string compare is safe.
const utcDateTime = z.iso.datetime();

function text(maxWords: number) {
  return z
    .string()
    .trim()
    .min(1)
    .refine((value) => countWords(value) <= maxWords, {
      message: `Must be at most ${maxWords} words`,
    });
}

export const CategorySchema = z.enum(CATEGORIES);

export const CardSchema = z.object({
  id: z.string().min(1),
  headline: text(HEADLINE_MAX_WORDS),
  summary: text(SUMMARY_MAX_WORDS),
  category: CategorySchema,
  importance: z.number().int().min(IMPORTANCE_MIN).max(IMPORTANCE_MAX),
  sourceName: z.string().trim().min(1),
  sourceUrl: webUrl,
  imageUrl: webUrl.nullable(),
  publishedAt: utcDateTime,
});

export const FeedSchema = z.object({
  version: z.literal(FEED_VERSION),
  generatedAt: utcDateTime,
  cards: z.array(CardSchema),
});

export const MetaSchema = z.object({
  version: z.literal(FEED_VERSION),
  minAppVersion: z.string().regex(/^\d+\.\d+\.\d+$/, 'Must be a semantic version like 1.0.0'),
  feedBaseUrls: z.array(webUrl).min(1),
  categories: z.array(CategorySchema).min(1),
});

export type Category = z.infer<typeof CategorySchema>;
export type Card = z.infer<typeof CardSchema>;
export type Feed = z.infer<typeof FeedSchema>;
export type Meta = z.infer<typeof MetaSchema>;
