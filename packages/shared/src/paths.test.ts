import { describe, expect, it } from 'vitest';
import { FEED_PATHS, feedUrl } from './paths';

describe('FEED_PATHS.archive', () => {
  it('builds the daily archive path', () => {
    expect(FEED_PATHS.archive('2026-10-28')).toBe('v1/feed/archive/2026-10-28.json');
  });

  it.each(['2026-2-3', '2026-02-30', '../../etc/passwd', '2026-10-28T00:00:00Z', ''])(
    'rejects %j',
    (date) => {
      expect(() => FEED_PATHS.archive(date)).toThrow(RangeError);
    },
  );
});

describe('feedUrl', () => {
  it.each([
    ['https://example.github.io/AIShort', 'https://example.github.io/AIShort/v1/meta.json'],
    ['https://example.github.io/AIShort/', 'https://example.github.io/AIShort/v1/meta.json'],
    ['https://example.github.io/AIShort//', 'https://example.github.io/AIShort/v1/meta.json'],
  ])('joins %j', (base, expected) => {
    expect(feedUrl(base, FEED_PATHS.meta)).toBe(expected);
  });
});
