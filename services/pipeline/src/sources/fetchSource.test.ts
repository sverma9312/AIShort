import { describe, expect, it } from 'vitest';
import { HTTP_FIXTURES_DIR } from '../testing';
import type { Source } from './config';
import { fetchAllSources, fetchSource } from './fetchSource';
import { createFixtureFetch } from './fixtureFetch';
import { HttpClient } from './http';

const now = new Date('2026-10-28T10:00:00Z');

const base = { weight: 5, aiFocused: false, enabled: true } as const;
const sources: Source[] = [
  { ...base, id: 'lab', name: 'Lab', kind: 'rss', url: 'https://feeds.example.com/lab.xml' },
  { ...base, id: 'hn', name: 'HN', kind: 'hn', minPoints: 100 },
  { ...base, id: 'papers', name: 'Papers', kind: 'hf-papers' },
  {
    ...base,
    id: 'robotics',
    name: 'Robotics',
    kind: 'html',
    url: 'https://robotics.example.com/news',
    linkPattern: '^/news/[a-z0-9-]+/?$',
    exclude: [],
    maxItems: 10,
  },
  {
    ...base,
    id: 'broken',
    name: 'Broken',
    kind: 'rss',
    url: 'https://feeds.example.com/missing.xml',
  },
];

const fetch = createFixtureFetch(
  {
    'https://feeds.example.com/lab.xml': { file: 'lab.rss.xml', headers: { etag: '"lab-1"' } },
    'https://hn.algolia.com/api/v1/search_by_date': { file: 'hn.json' },
    'https://huggingface.co/api/daily_papers': { file: 'hf-papers.json' },
    'https://robotics.example.com/news': { file: 'robotics-listing.html' },
  },
  HTTP_FIXTURES_DIR,
);
const http = new HttpClient({ userAgent: 'test', fetch });

describe('fetchAllSources', () => {
  it('fetches every kind and isolates failures', async () => {
    const results = await fetchAllSources(sources, { http, now, validatorsFor: () => undefined });
    const byId = Object.fromEntries(results.map((r) => [r.sourceId, r]));

    expect(byId['lab']).toMatchObject({ status: 'ok', validators: { etag: '"lab-1"' } });
    expect(byId['broken']).toMatchObject({
      status: 'error',
      error: expect.stringContaining('404') as string,
    });
    for (const id of ['lab', 'hn', 'papers', 'robotics']) {
      const result = byId[id];
      expect(result?.status).toBe('ok');
      if (result?.status !== 'ok') continue;
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items.every((item) => item.sourceId === id)).toBe(true);
    }
  });

  it('marks listing-page titles as provisional', async () => {
    const result = await fetchSource(sources[3]!, { http, now });
    expect(result.status === 'ok' && result.items.every((i) => i.titleIsProvisional)).toBe(true);
  });

  it('reports parse failures as errors', async () => {
    const badFetch = createFixtureFetch({ 'https://feeds.example.com/lab.xml': { body: '{}' } });
    const result = await fetchSource(sources[0]!, {
      http: new HttpClient({ userAgent: 'test', fetch: badFetch }),
      now,
    });
    expect(result).toMatchObject({
      status: 'error',
      error: expect.stringMatching(/Invalid XML/) as string,
    });
  });

  it('does not send stale validators to Hacker News', async () => {
    const hnFetch = createFixtureFetch(
      { 'https://hn.algolia.com/api/v1/search_by_date': { file: 'hn.json' } },
      HTTP_FIXTURES_DIR,
    );
    await fetchSource(sources[1]!, {
      http: new HttpClient({ userAgent: 'test', fetch: hnFetch }),
      now,
      validators: { etag: '"old"' },
    });
    expect(hnFetch.requests[0]?.headers).not.toHaveProperty('If-None-Match');
  });
});
