import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadSources, parseSources } from './config';

const SOURCES_FILE = fileURLToPath(new URL('../../sources.yaml', import.meta.url));

describe('sources.yaml', () => {
  it('is valid', async () => {
    const sources = await loadSources(SOURCES_FILE);
    expect(sources.length).toBeGreaterThan(10);
    expect(sources.every((s) => s.weight >= 1 && s.weight <= 10)).toBe(true);
  });

  it('contains every source kind', async () => {
    const kinds = new Set((await loadSources(SOURCES_FILE)).map((s) => s.kind));
    expect([...kinds].sort()).toEqual(['hf-papers', 'hn', 'html', 'rss']);
  });
});

describe('parseSources', () => {
  const rss = `{ id: a, name: A, kind: rss, url: "https://a.example.com/feed", weight: 5 }`;

  it('applies defaults', () => {
    const [source] = parseSources(`sources: [${rss}]`);
    expect(source).toMatchObject({ enabled: true, aiFocused: false });
  });

  it.each([
    ['duplicate ids', `sources: [${rss}, ${rss}]`],
    ['an unknown kind', `sources: [{ id: a, name: A, kind: ftp, weight: 5 }]`],
    [
      'a non-http url',
      `sources: [{ id: a, name: A, kind: rss, url: "file:///etc/passwd", weight: 5 }]`,
    ],
    ['a weight above 10', `sources: [{ id: a, name: A, kind: hn, weight: 11 }]`],
    ['an invalid id', `sources: [{ id: "A B", name: A, kind: hn, weight: 5 }]`],
    [
      'html without linkPattern',
      `sources: [{ id: a, name: A, kind: html, url: "https://a.example.com", weight: 5 }]`,
    ],
    [
      'an invalid linkPattern',
      `sources: [{ id: a, name: A, kind: html, url: "https://a.example.com", linkPattern: "([", weight: 5 }]`,
    ],
    ['an empty list', `sources: []`],
  ])('rejects %s', (_name, yaml) => {
    expect(() => parseSources(yaml)).toThrow();
  });
});
