import { z } from 'zod';
import { CardSchema, FeedSchema, type Feed } from './schemas';

const FeedEnvelopeSchema = FeedSchema.extend({ cards: z.array(z.unknown()) });

export type LenientFeedResult =
  { ok: true; feed: Feed; droppedCount: number } | { ok: false; error: z.ZodError };

/**
 * Parses a feed for display: the envelope must be valid, but individual invalid cards are
 * dropped instead of rejecting the whole feed, so one bad card can never blank the app.
 * (The pipeline uses the strict `FeedSchema` before publishing.)
 */
export function parseFeedLenient(input: unknown): LenientFeedResult {
  const envelope = FeedEnvelopeSchema.safeParse(input);
  if (!envelope.success) {
    return { ok: false, error: envelope.error };
  }

  const cards: Feed['cards'] = [];
  for (const raw of envelope.data.cards) {
    const card = CardSchema.safeParse(raw);
    if (card.success) {
      cards.push(card.data);
    }
  }

  return {
    ok: true,
    feed: { ...envelope.data, cards },
    droppedCount: envelope.data.cards.length - cards.length,
  };
}
