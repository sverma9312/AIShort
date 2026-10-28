import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HTTP_FIXTURES_DIR } from '../testing';
import { parseFeed } from './rss';

const fixture = (name: string) => readFileSync(join(HTTP_FIXTURES_DIR, name), 'utf8');

describe('parseFeed', () => {
  it('parses RSS 2.0 items', () => {
    const items = parseFeed(fixture('lab.rss.xml'));
    expect(items).toHaveLength(3); // the item without a link is skipped
    expect(items[0]).toEqual({
      url: 'https://lab.example.com/news/nova-2',
      title: 'Example AI Lab introduces Nova-2, an open-weight reasoning model',
      description: 'Nova-2 is our most capable open-weight model yet.',
      publishedAt: '2026-10-28T08:00:00.000Z',
      imageUrl: 'https://lab.example.com/images/nova-2.png',
    });
    expect(items[1]).toMatchObject({
      description: 'How we test models before release & what we publish.',
      imageUrl: 'https://lab.example.com/images/safety.jpg',
    });
    expect(items[2]).not.toHaveProperty('description');
  });

  it('parses Atom entries, resolving relative links against the feed URL', () => {
    const items = parseFeed(fixture('technews.atom.xml'), 'https://news.example.org/feed.xml');
    expect(items.map((i) => i.url)).toEqual([
      'https://news.example.org/2026/10/28/nova-2-open-weight-model?utm_source=rss&utm_medium=feed',
      'https://news.example.org/2026/10/28/bike-lanes',
      'https://news.example.org/2026/10/27/acme-robotics-funding',
    ]);
    expect(items[0]).toMatchObject({
      publishedAt: '2026-10-28T08:30:00.000Z', // prefers <published> over <updated>
      description: 'The new model is available today.',
    });
    expect(items[1]?.publishedAt).toBe('2026-10-28T07:00:00.000Z');
    expect(items[2]?.description).toBe('Acme Robotics closed a Series B round.');
  });

  it('parses RSS 1.0 (RDF) items', () => {
    expect(parseFeed(fixture('journal.rdf.xml'))).toEqual([
      {
        url: 'https://journal.example.com/papers/1',
        title: 'Sparse attention at scale',
        description: 'A study of sparse attention.',
        publishedAt: '2026-10-27T12:00:00.000Z',
      },
    ]);
  });

  it('uses a permalink guid when there is no <link>', () => {
    const xml = `<rss><channel><item><title>T</title><guid>https://a.example.com/p</guid></item></channel></rss>`;
    expect(parseFeed(xml)[0]?.url).toBe('https://a.example.com/p');
  });

  it('ignores non-http links and unparseable dates', () => {
    const xml = `<rss><channel>
      <item><title>Bad</title><link>javascript:alert(1)</link></item>
      <item><title>Good</title><link>https://a.example.com/x</link><pubDate>not a date</pubDate></item>
    </channel></rss>`;
    expect(parseFeed(xml)).toEqual([{ url: 'https://a.example.com/x', title: 'Good' }]);
  });

  it('handles a channel with a single item', () => {
    const xml = `<rss><channel><item><title>Only</title><link>https://a.example.com/1</link></item></channel></rss>`;
    expect(parseFeed(xml)).toHaveLength(1);
  });

  it.each([
    ['HTML', '<!doctype html><html><body>Not a feed</body></html>'],
    ['malformed XML', '<rss><channel><item></rss>'],
  ])('rejects %s', (_name, body) => {
    expect(() => parseFeed(body)).toThrow();
  });
});
