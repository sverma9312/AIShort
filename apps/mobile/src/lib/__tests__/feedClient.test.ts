import latest from '@aishort/shared/fixtures/latest.valid.json';
import { fetchLatestFeed, FeedUnavailableError, mergeBaseUrls } from '../feedClient';

type Route = { status?: number; body?: unknown; etag?: string } | Error;

function fakeFetch(routes: Record<string, Route>) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetch = (url: string, init?: RequestInit) => {
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    const route = routes[url];
    if (!route) return Promise.resolve(new Response('not found', { status: 404 }));
    if (route instanceof Error) return Promise.reject(route);
    const status = route.status ?? 200;
    return Promise.resolve(
      new Response(status === 304 ? null : JSON.stringify(route.body ?? latest), {
        status,
        headers: route.etag ? { etag: route.etag } : {},
      }),
    );
  };
  return { fetch, calls };
}

const A = 'https://a.example.com/AIShort';
const B = 'https://b.example.com/mirror';

describe('fetchLatestFeed', () => {
  it('returns the feed and its ETag', async () => {
    const { fetch } = fakeFetch({ [`${A}/v1/feed/latest.json`]: { etag: '"v1"' } });
    const result = await fetchLatestFeed({ baseUrls: [A], fetch });
    expect(result).toMatchObject({ status: 'ok', etag: '"v1"', baseUrl: A, droppedCards: 0 });
    expect(result.status === 'ok' && result.feed.cards).toHaveLength(latest.cards.length);
  });

  it('sends If-None-Match only to the URL the cached ETag came from', async () => {
    const { fetch, calls } = fakeFetch({ [`${A}/v1/feed/latest.json`]: { status: 304 } });
    const result = await fetchLatestFeed({
      baseUrls: [A],
      cached: { baseUrl: A, etag: '"v1"' },
      fetch,
    });
    expect(result).toEqual({ status: 'not-modified', baseUrl: A });
    expect(calls[0]?.headers['If-None-Match']).toBe('"v1"');

    const other = fakeFetch({ [`${A}/v1/feed/latest.json`]: {} });
    await fetchLatestFeed({
      baseUrls: [A],
      cached: { baseUrl: B, etag: '"v1"' },
      fetch: other.fetch,
    });
    expect(other.calls[0]?.headers['If-None-Match']).toBeUndefined();
  });

  it('falls back to the next URL on HTTP errors, network errors and invalid feeds', async () => {
    for (const failure of [
      { status: 503 },
      new TypeError('Network request failed'),
      { body: { nope: true } },
    ]) {
      const { fetch } = fakeFetch({
        [`${A}/v1/feed/latest.json`]: failure,
        [`${B}/v1/feed/latest.json`]: {},
      });
      await expect(fetchLatestFeed({ baseUrls: [A, B], fetch })).resolves.toMatchObject({
        status: 'ok',
        baseUrl: B,
      });
    }
  });

  it('drops invalid cards instead of rejecting the feed', async () => {
    const body = {
      ...latest,
      cards: [...latest.cards, { id: 'bad', sourceUrl: 'javascript:alert(1)' }],
    };
    const { fetch } = fakeFetch({ [`${A}/v1/feed/latest.json`]: { body } });
    await expect(fetchLatestFeed({ baseUrls: [A], fetch })).resolves.toMatchObject({
      droppedCards: 1,
    });
  });

  it('throws FeedUnavailableError when every URL fails', async () => {
    const { fetch } = fakeFetch({});
    await expect(fetchLatestFeed({ baseUrls: [A, B], fetch })).rejects.toBeInstanceOf(
      FeedUnavailableError,
    );
  });
});

describe('mergeBaseUrls', () => {
  it('puts meta.json URLs first and removes duplicates and trailing slashes', () => {
    expect(mergeBaseUrls([`${B}/`, A], [A])).toEqual([B, A]);
    expect(mergeBaseUrls(undefined, [A])).toEqual([A]);
  });
});
