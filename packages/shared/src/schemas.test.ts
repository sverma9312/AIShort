import { describe, expect, it } from 'vitest';
import latest from '../fixtures/latest.valid.json';
import meta from '../fixtures/meta.valid.json';
import { CATEGORIES, SUMMARY_MAX_WORDS } from './constants';
import { CardSchema, FeedSchema, MetaSchema, type Card } from './schemas';

const validCard: Card = {
  id: 'c_1',
  headline: 'A short headline',
  summary: 'A short summary.',
  category: 'research',
  importance: 5,
  sourceName: 'Example',
  sourceUrl: 'https://example.com/a',
  imageUrl: null,
  publishedAt: '2026-10-28T08:00:00Z',
};

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');

describe('contract fixtures', () => {
  it('latest.valid.json matches FeedSchema', () => {
    expect(FeedSchema.safeParse(latest).success).toBe(true);
  });

  it('meta.valid.json matches MetaSchema', () => {
    expect(MetaSchema.safeParse(meta).success).toBe(true);
  });

  it('meta fixture lists every category', () => {
    expect([...meta.categories].sort()).toEqual([...CATEGORIES].sort());
  });
});

describe('CardSchema', () => {
  it('accepts a valid card', () => {
    expect(CardSchema.parse(validCard)).toEqual(validCard);
  });

  it('accepts a summary of exactly the word limit', () => {
    const card = { ...validCard, summary: words(SUMMARY_MAX_WORDS) };
    expect(CardSchema.safeParse(card).success).toBe(true);
  });

  // Product requirements, pinned as literals so changing a constant can't silently move them.
  it('enforces the 60-word summary limit', () => {
    expect(CardSchema.safeParse({ ...validCard, summary: words(60) }).success).toBe(true);
    expect(CardSchema.safeParse({ ...validCard, summary: words(61) }).success).toBe(false);
  });

  it('enforces the 12-word headline limit', () => {
    expect(CardSchema.safeParse({ ...validCard, headline: words(12) }).success).toBe(true);
    expect(CardSchema.safeParse({ ...validCard, headline: words(13) }).success).toBe(false);
  });

  it('trims headline and summary', () => {
    const card = CardSchema.parse({ ...validCard, headline: '  Hi  ', summary: ' There ' });
    expect(card.headline).toBe('Hi');
    expect(card.summary).toBe('There');
  });

  it('strips unknown fields so newer feeds stay readable by older apps', () => {
    const card = CardSchema.parse({ ...validCard, futureField: true });
    expect(card).not.toHaveProperty('futureField');
  });

  it.each<[string, Partial<Record<keyof Card, unknown>>]>([
    ['summary over the word limit', { summary: words(SUMMARY_MAX_WORDS + 1) }],
    ['headline over 12 words', { headline: words(13) }],
    ['empty headline', { headline: '   ' }],
    ['empty id', { id: '' }],
    ['unknown category', { category: 'gossip' }],
    ['importance below 1', { importance: 0 }],
    ['importance above 10', { importance: 11 }],
    ['fractional importance', { importance: 5.5 }],
    ['javascript: source URL', { sourceUrl: 'javascript:alert(1)' }],
    ['ftp: source URL', { sourceUrl: 'ftp://example.com/a' }],
    ['relative image URL', { imageUrl: '/img.png' }],
    ['missing image URL (must be null, not absent)', { imageUrl: undefined }],
    ['non-UTC timestamp', { publishedAt: '2026-10-28T08:00:00+05:30' }],
    ['date-only timestamp', { publishedAt: '2026-10-28' }],
  ])('rejects %s', (_name, override) => {
    expect(CardSchema.safeParse({ ...validCard, ...override }).success).toBe(false);
  });
});

describe('FeedSchema', () => {
  it('rejects an unsupported version', () => {
    expect(FeedSchema.safeParse({ ...latest, version: 2 }).success).toBe(false);
  });

  it('rejects the whole feed if any card is invalid', () => {
    const feed = { ...latest, cards: [...latest.cards, { ...validCard, importance: 99 }] };
    expect(FeedSchema.safeParse(feed).success).toBe(false);
  });
});

describe('MetaSchema', () => {
  it.each<[string, Record<string, unknown>]>([
    ['empty feedBaseUrls', { feedBaseUrls: [] }],
    ['non-https base URL', { feedBaseUrls: ['javascript:alert(1)'] }],
    ['non-semver minAppVersion', { minAppVersion: '1.0' }],
    ['unknown category', { categories: ['models', 'gossip'] }],
  ])('rejects %s', (_name, override) => {
    expect(MetaSchema.safeParse({ ...meta, ...override }).success).toBe(false);
  });
});
