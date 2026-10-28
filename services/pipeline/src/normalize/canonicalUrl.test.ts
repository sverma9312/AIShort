import { describe, expect, it } from 'vitest';
import { canonicalUrl, urlHash } from './canonicalUrl';

describe('canonicalUrl', () => {
  it.each([
    // unchanged
    ['https://example.com/a', 'https://example.com/a'],
    ['https://example.com/', 'https://example.com/'],
    ['http://example.com/a', 'http://example.com/a'],
    // case, fragments, credentials, default ports
    ['https://EXAMPLE.com/A', 'https://example.com/A'],
    ['https://example.com/a#section', 'https://example.com/a'],
    ['https://user:pw@example.com/a', 'https://example.com/a'],
    ['https://example.com:443/a', 'https://example.com/a'],
    // trailing and duplicate slashes
    ['https://example.com/a/', 'https://example.com/a'],
    ['https://example.com/a//b///', 'https://example.com/a/b'],
    // tracking parameters
    ['https://example.com/a?utm_source=rss&utm_medium=feed', 'https://example.com/a'],
    ['https://example.com/a?fbclid=x&gclid=y&ref=hn', 'https://example.com/a'],
    ['https://example.com/a?UTM_Campaign=x', 'https://example.com/a'],
    ['https://example.com/a?id=5&utm_source=x', 'https://example.com/a?id=5'],
    // remaining parameters are sorted
    ['https://example.com/a?b=2&a=1', 'https://example.com/a?a=1&b=2'],
    // AMP variants
    ['https://example.com/story/amp', 'https://example.com/story'],
    ['https://example.com/story/amp/', 'https://example.com/story'],
    ['https://example.com/story.amp.html', 'https://example.com/story.html'],
    ['https://amp.example.com/story', 'https://example.com/story'],
    ['https://example.com/story?amp=1', 'https://example.com/story'],
    ['https://www.google.com/amp/s/example.com/story/amp', 'https://example.com/story'],
  ])('%s → %s', (input, expected) => {
    expect(canonicalUrl(input)).toBe(expected);
  });

  it.each(['javascript:alert(1)', 'mailto:a@example.com', 'ftp://example.com/a', '/relative', ''])(
    'rejects %j',
    (input) => {
      expect(() => canonicalUrl(input)).toThrow();
    },
  );
});

describe('urlHash', () => {
  it('is a stable sha256 hex digest', () => {
    const hash = urlHash('https://example.com/a');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(urlHash('https://example.com/a')).toBe(hash);
  });

  it('treats http/https and www/non-www as the same article', () => {
    const hash = urlHash('https://example.com/a');
    expect(urlHash('http://example.com/a')).toBe(hash);
    expect(urlHash('https://www.example.com/a')).toBe(hash);
  });

  it('distinguishes different paths and queries', () => {
    expect(urlHash('https://example.com/a')).not.toBe(urlHash('https://example.com/b'));
    expect(urlHash('https://example.com/a?id=1')).not.toBe(urlHash('https://example.com/a?id=2'));
  });
});
