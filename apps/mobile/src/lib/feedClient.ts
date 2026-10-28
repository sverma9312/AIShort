import {
  FEED_PATHS,
  feedUrl,
  MetaSchema,
  parseFeedLenient,
  type Feed,
  type Meta,
} from '@aishort/shared';

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export interface FetchFeedOptions {
  /** Feed locations to try, in order. */
  baseUrls: readonly string[];
  /** ETag of the cached feed, and the base URL it came from (ETags differ between mirrors). */
  cached?: { etag?: string; baseUrl: string };
  fetch?: FetchFn;
  timeoutMs?: number;
}

export type FetchFeedResult =
  | { status: 'ok'; feed: Feed; etag?: string; baseUrl: string; droppedCards: number }
  | { status: 'not-modified'; baseUrl: string };

export class FeedUnavailableError extends Error {
  constructor(readonly attempts: { baseUrl: string; error: string }[]) {
    super(
      `Feed unavailable: ${attempts.map((a) => `${a.baseUrl} (${a.error})`).join('; ') || 'no feed URLs'}`,
    );
    this.name = 'FeedUnavailableError';
  }
}

/**
 * Downloads latest.json, trying each base URL in order. Sends If-None-Match so an unchanged feed
 * costs a 304. Invalid cards are dropped (never the whole feed); an invalid envelope, network
 * error or HTTP error moves on to the next URL.
 */
export async function fetchLatestFeed(options: FetchFeedOptions): Promise<FetchFeedResult> {
  const fetchFn = options.fetch ?? ((input, init) => fetch(input, init));
  const attempts: { baseUrl: string; error: string }[] = [];

  for (const baseUrl of options.baseUrls) {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.cached?.etag && options.cached.baseUrl === baseUrl)
      headers['If-None-Match'] = options.cached.etag;
    try {
      const response = await fetchFn(feedUrl(baseUrl, FEED_PATHS.latest), {
        headers,
        signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
      });
      if (response.status === 304) return { status: 'not-modified', baseUrl };
      if (!response.ok) {
        attempts.push({ baseUrl, error: `HTTP ${response.status}` });
        continue;
      }
      const parsed = parseFeedLenient(await response.json());
      if (!parsed.ok) {
        attempts.push({ baseUrl, error: 'invalid feed' });
        continue;
      }
      const etag = response.headers.get('etag') ?? undefined;
      return {
        status: 'ok',
        feed: parsed.feed,
        baseUrl,
        droppedCards: parsed.droppedCount,
        ...(etag ? { etag } : {}),
      };
    } catch (error) {
      attempts.push({ baseUrl, error: error instanceof Error ? error.message : String(error) });
    }
  }
  throw new FeedUnavailableError(attempts);
}

/** Downloads meta.json from the first base URL that serves a valid one. */
export async function fetchMeta(
  baseUrls: readonly string[],
  fetchFn: FetchFn = (i, init) => fetch(i, init),
): Promise<Meta | undefined> {
  for (const baseUrl of baseUrls) {
    try {
      const response = await fetchFn(feedUrl(baseUrl, FEED_PATHS.meta), {
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) continue;
      const parsed = MetaSchema.safeParse(await response.json());
      if (parsed.success) return parsed.data;
    } catch {
      // try the next URL
    }
  }
  return undefined;
}

/** meta.json's URLs first (they can move the feed), then the built-in ones, without duplicates. */
export function mergeBaseUrls(
  fromMeta: readonly string[] | undefined,
  builtIn: readonly string[],
): string[] {
  const normalize = (url: string) => url.replace(/\/+$/, '');
  return [...new Set([...(fromMeta ?? []), ...builtIn].map(normalize))];
}
