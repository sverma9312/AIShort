import { mapLimit } from '../lib/concurrency';
import type { RawItem } from '../types';
import type { Source } from './config';
import { HF_DAILY_PAPERS_URL, parseHfPapers } from './hfPapers';
import { hnSearchUrl, parseHnResponse } from './hn';
import { parseListing } from './html';
import type { CacheValidators, HttpClient } from './http';
import { parseFeed } from './rss';

const DEFAULT_HN_MIN_POINTS = 100;

export type SourceFetchResult =
  | { sourceId: string; status: 'ok'; items: RawItem[]; validators: CacheValidators }
  | { sourceId: string; status: 'not-modified' }
  | { sourceId: string; status: 'error'; error: string };

export interface FetchContext {
  http: HttpClient;
  now: Date;
  validators?: CacheValidators;
}

export async function fetchSource(source: Source, ctx: FetchContext): Promise<SourceFetchResult> {
  try {
    const url = sourceUrl(source, ctx.now);
    // HN URLs embed the current time, so validators from a previous run never apply.
    const validators = source.kind === 'hn' ? undefined : ctx.validators;
    const response = await ctx.http.get(url, {
      ...(validators ? { validators } : {}),
      accept: acceptHeader(source),
    });
    if (response.status === 'not-modified') {
      return { sourceId: source.id, status: 'not-modified' };
    }
    const items = parseBody(source, response.body, response.finalUrl).map((item) => ({
      ...item,
      sourceId: source.id,
    }));
    return { sourceId: source.id, status: 'ok', items, validators: response.validators };
  } catch (error) {
    return {
      sourceId: source.id,
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Fetches every source; one failing source never affects the others. */
export function fetchAllSources(
  sources: readonly Source[],
  ctx: Omit<FetchContext, 'validators'> & {
    validatorsFor: (sourceId: string) => CacheValidators | undefined;
    concurrency?: number;
  },
): Promise<SourceFetchResult[]> {
  return mapLimit(sources, ctx.concurrency ?? 8, (source) => {
    const validators = ctx.validatorsFor(source.id);
    return fetchSource(source, {
      http: ctx.http,
      now: ctx.now,
      ...(validators ? { validators } : {}),
    });
  });
}

function sourceUrl(source: Source, now: Date): string {
  switch (source.kind) {
    case 'rss':
    case 'html':
      return source.url;
    case 'hn':
      return hnSearchUrl(now, source.minPoints ?? DEFAULT_HN_MIN_POINTS);
    case 'hf-papers':
      return HF_DAILY_PAPERS_URL;
  }
}

function acceptHeader(source: Source): string {
  switch (source.kind) {
    case 'rss':
      return 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5';
    case 'html':
      return 'text/html, application/xhtml+xml;q=0.9, */*;q=0.5';
    case 'hn':
    case 'hf-papers':
      return 'application/json';
  }
}

function parseBody(source: Source, body: string, finalUrl: string): Omit<RawItem, 'sourceId'>[] {
  switch (source.kind) {
    case 'rss':
      return parseFeed(body, finalUrl);
    case 'hn':
      return parseHnResponse(parseJson(body));
    case 'hf-papers':
      return parseHfPapers(parseJson(body));
    case 'html':
      return parseListing(body, finalUrl, source).map((item) => ({
        ...item,
        titleIsProvisional: true,
      }));
  }
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    throw new Error('Response is not valid JSON');
  }
}
