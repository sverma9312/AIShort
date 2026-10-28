import type { HttpClient } from '../sources/http';
import { extractArticle, type ExtractedArticle } from './extract';
import type { RobotsChecker } from './robots';

export type ArticleFetchResult =
  | { status: 'ok'; article: ExtractedArticle }
  | { status: 'skipped'; reason: 'robots' | 'not-html' }
  | { status: 'error'; error: string };

/** Something that turns an article URL into text; faked in tests. */
export interface ArticleFetcher {
  fetch(url: string): Promise<ArticleFetchResult>;
}

export class HttpArticleFetcher implements ArticleFetcher {
  constructor(
    private readonly http: HttpClient,
    private readonly robots: RobotsChecker,
  ) {}

  async fetch(url: string): Promise<ArticleFetchResult> {
    try {
      if (!(await this.robots.isAllowed(url))) return { status: 'skipped', reason: 'robots' };
      const response = await this.http.get(url, {
        accept: 'text/html, application/xhtml+xml;q=0.9, */*;q=0.5',
      });
      if (response.status !== 'ok') return { status: 'error', error: 'unexpected 304' };
      if (response.contentType && !/html/i.test(response.contentType)) {
        return { status: 'skipped', reason: 'not-html' };
      }
      return { status: 'ok', article: extractArticle(response.body, response.finalUrl) };
    } catch (error) {
      return { status: 'error', error: error instanceof Error ? error.message : String(error) };
    }
  }
}
