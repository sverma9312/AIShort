import { describe, expect, it } from 'vitest';
import { createFixtureFetch } from '../sources/fixtureFetch';
import { HttpClient } from '../sources/http';
import { HTTP_FIXTURES_DIR } from '../testing';
import { HttpArticleFetcher } from './fetchArticle';
import { RobotsChecker } from './robots';

function fetcher(routes: Parameters<typeof createFixtureFetch>[0]) {
  const http = new HttpClient({
    userAgent: 'AIShortBot/1.0',
    fetch: createFixtureFetch(routes, HTTP_FIXTURES_DIR),
  });
  return new HttpArticleFetcher(http, new RobotsChecker(http, 'AIShortBot'));
}

describe('HttpArticleFetcher', () => {
  it('fetches and extracts an article', async () => {
    const result = await fetcher({
      'https://lab.example.com/news/nova-2': {
        file: 'nova-2.html',
        headers: { 'content-type': 'text/html' },
      },
    }).fetch('https://lab.example.com/news/nova-2');
    expect(result.status).toBe('ok');
    expect(result.status === 'ok' && result.article.text).toContain('Nova-2');
  });

  it('respects robots.txt', async () => {
    const result = await fetcher({
      'https://lab.example.com/robots.txt': { body: 'User-agent: *\nDisallow: /' },
      'https://lab.example.com/news/nova-2': { file: 'nova-2.html' },
    }).fetch('https://lab.example.com/news/nova-2');
    expect(result).toEqual({ status: 'skipped', reason: 'robots' });
  });

  it('skips non-HTML responses', async () => {
    const result = await fetcher({
      'https://lab.example.com/paper.pdf': {
        body: '%PDF-1.7',
        headers: { 'content-type': 'application/pdf' },
      },
    }).fetch('https://lab.example.com/paper.pdf');
    expect(result).toEqual({ status: 'skipped', reason: 'not-html' });
  });

  it('reports HTTP errors instead of throwing', async () => {
    const result = await fetcher({}).fetch('https://lab.example.com/missing');
    expect(result).toMatchObject({
      status: 'error',
      error: expect.stringContaining('404') as string,
    });
  });
});
