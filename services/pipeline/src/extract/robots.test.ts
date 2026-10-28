import { describe, expect, it } from 'vitest';
import { createFixtureFetch } from '../sources/fixtureFetch';
import { HttpClient } from '../sources/http';
import { RobotsChecker } from './robots';

const robotsTxt = `
User-agent: *
Disallow: /private/

User-agent: AIShortBot
Disallow: /no-bots/
`;

function checker(routes: Parameters<typeof createFixtureFetch>[0]) {
  const fetch = createFixtureFetch(routes);
  return {
    robots: new RobotsChecker(new HttpClient({ userAgent: 'AIShortBot/1.0', fetch }), 'AIShortBot'),
    fetch,
  };
}

describe('RobotsChecker', () => {
  it('applies the rules for our user agent', async () => {
    const { robots } = checker({ 'https://a.example.com/robots.txt': { body: robotsTxt } });
    expect(await robots.isAllowed('https://a.example.com/news/1')).toBe(true);
    expect(await robots.isAllowed('https://a.example.com/no-bots/1')).toBe(false);
  });

  it('caches robots.txt per origin', async () => {
    const { robots, fetch } = checker({ 'https://a.example.com/robots.txt': { body: robotsTxt } });
    await robots.isAllowed('https://a.example.com/1');
    await robots.isAllowed('https://a.example.com/2');
    expect(fetch.requests).toHaveLength(1);
  });

  it('allows everything when robots.txt is missing (4xx)', async () => {
    const { robots } = checker({});
    expect(await robots.isAllowed('https://a.example.com/anything')).toBe(true);
  });

  it('disallows everything when robots.txt is unreachable (5xx)', async () => {
    const { robots } = checker({ 'https://a.example.com/robots.txt': { status: 503 } });
    expect(await robots.isAllowed('https://a.example.com/anything')).toBe(false);
  });
});
