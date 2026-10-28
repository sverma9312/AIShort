import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FetchFn } from './http';

export interface FixtureRoute {
  /** File path, relative to the fixture directory. */
  file?: string;
  body?: string;
  status?: number;
  headers?: Record<string, string>;
}

/**
 * A `fetch` replacement that serves canned responses, for tests and the offline dry run.
 * Routes match the exact URL first, then the URL without its query string; anything else is 404.
 */
export function createFixtureFetch(
  routes: Record<string, FixtureRoute>,
  fixtureDir = '.',
): FetchFn & { requests: { url: string; headers: Record<string, string> }[] } {
  const requests: { url: string; headers: Record<string, string> }[] = [];
  const fetchFn = (input: string, init?: RequestInit): Promise<Response> => {
    requests.push({ url: input, headers: { ...(init?.headers as Record<string, string>) } });
    const route = routes[input] ?? routes[input.split('?')[0] ?? input];
    if (!route) {
      return Promise.resolve(new Response('Not Found', { status: 404 }));
    }
    const body = route.file
      ? readFileSync(join(fixtureDir, route.file), 'utf8')
      : (route.body ?? '');
    const status = route.status ?? 200;
    const response = new Response(status === 304 ? null : body, {
      status,
      headers: route.headers ?? {},
    });
    Object.defineProperty(response, 'url', { value: input });
    return Promise.resolve(response);
  };
  return Object.assign(fetchFn, { requests });
}
