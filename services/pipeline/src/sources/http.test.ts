import { describe, expect, it } from 'vitest';
import { createFixtureFetch } from './fixtureFetch';
import { HttpClient, HttpError } from './http';

const UA = 'AIShortBot/test';

describe('HttpClient', () => {
  it('sends the user agent and conditional headers, and returns new validators', async () => {
    const fetch = createFixtureFetch({
      'https://a.example.com/feed': {
        body: '<rss/>',
        headers: { etag: '"v2"', 'last-modified': 'Wed, 28 Oct 2026 08:00:00 GMT' },
      },
    });
    const http = new HttpClient({ userAgent: UA, fetch });

    const result = await http.get('https://a.example.com/feed', {
      validators: { etag: '"v1"', lastModified: 'Tue, 27 Oct 2026 08:00:00 GMT' },
    });

    expect(result).toMatchObject({
      status: 'ok',
      body: '<rss/>',
      validators: { etag: '"v2"', lastModified: 'Wed, 28 Oct 2026 08:00:00 GMT' },
    });
    expect(fetch.requests[0]?.headers).toMatchObject({
      'User-Agent': UA,
      'If-None-Match': '"v1"',
      'If-Modified-Since': 'Tue, 27 Oct 2026 08:00:00 GMT',
    });
  });

  it('reports 304 as not-modified', async () => {
    const fetch = createFixtureFetch({ 'https://a.example.com/feed': { status: 304 } });
    const result = await new HttpClient({ userAgent: UA, fetch }).get('https://a.example.com/feed');
    expect(result).toEqual({ status: 'not-modified' });
  });

  it('throws HttpError with the status for non-2xx responses', async () => {
    const fetch = createFixtureFetch({ 'https://a.example.com/x': { status: 503 } });
    const error = await new HttpClient({ userAgent: UA, fetch })
      .get('https://a.example.com/x')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ status: 503 });
  });

  it('rejects bodies larger than maxBytes', async () => {
    const fetch = createFixtureFetch({ 'https://a.example.com/big': { body: 'x'.repeat(1000) } });
    const http = new HttpClient({ userAgent: UA, fetch, maxBytes: 100 });
    await expect(http.get('https://a.example.com/big')).rejects.toThrow(/exceeded 100 bytes/);
  });

  it('times out slow responses', async () => {
    const hang = (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason as Error));
      });
    const http = new HttpClient({ userAgent: UA, fetch: hang, timeoutMs: 20 });
    await expect(http.get('https://a.example.com/slow')).rejects.toThrow(/timed out after 20 ms/);
  });

  it('wraps network errors in HttpError', async () => {
    const http = new HttpClient({
      userAgent: UA,
      fetch: () => Promise.reject(new TypeError('getaddrinfo ENOTFOUND')),
    });
    await expect(http.get('https://nope.example.com')).rejects.toThrow(HttpError);
  });
});
