import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HTTP_FIXTURES_DIR } from '../testing';
import { hnSearchUrl, parseHnResponse } from './hn';

describe('hnSearchUrl', () => {
  it('filters by points and a 48 h window', () => {
    const url = new URL(hnSearchUrl(new Date('2026-10-28T10:00:00Z'), 100));
    expect(url.origin + url.pathname).toBe('https://hn.algolia.com/api/v1/search_by_date');
    expect(url.searchParams.get('tags')).toBe('story');
    expect(url.searchParams.get('numericFilters')).toBe('points>=100,created_at_i>1793008800');
  });
});

describe('parseHnResponse', () => {
  it('keeps stories with an article URL', () => {
    const json: unknown = JSON.parse(readFileSync(join(HTTP_FIXTURES_DIR, 'hn.json'), 'utf8'));
    const items = parseHnResponse(json);
    expect(items.map((i) => i.points)).toEqual([450, 150, 20]); // Ask HN (no URL) skipped
    expect(items[0]).toEqual({
      url: 'https://lab.example.com/news/nova-2?ref=hn',
      title: 'Example AI Lab introduces Nova-2, an open-weight reasoning model',
      points: 450,
      publishedAt: '2026-10-28T08:20:00.000Z',
    });
  });

  it('rejects an unexpected response shape', () => {
    expect(() => parseHnResponse({ results: [] })).toThrow();
  });
});
