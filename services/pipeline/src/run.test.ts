import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HttpArticleFetcher } from './extract/fetchArticle';
import { RobotsChecker } from './extract/robots';
import { silentLogger } from './lib/log';
import { HeuristicClassifier, type Classifier } from './llm/classify';
import { ExtractiveSummarizer, type Summarizer } from './llm/summarize';
import { AllProvidersFailedError } from './llm/types';
import { canonicalUrl, urlHash } from './normalize/canonicalUrl';
import { runPipeline, type PipelineDeps } from './run';
import { parseSources } from './sources/config';
import { createFixtureFetch, type FixtureRoute } from './sources/fixtureFetch';
import { HttpClient } from './sources/http';
import type { Store } from './store/types';
import { MemoryStore } from './store/memoryStore';
import { createTestDatabase } from './store/pglite';
import { SupabaseStore } from './store/supabaseStore';
import { FIXTURES_DIR, HTTP_FIXTURES_DIR } from './testing';

const manifest = JSON.parse(readFileSync(join(HTTP_FIXTURES_DIR, 'manifest.json'), 'utf8')) as {
  now: string;
  routes: Record<string, FixtureRoute>;
};
const sources = parseSources(readFileSync(join(FIXTURES_DIR, 'sources.dry.yaml'), 'utf8'));
const now = new Date(manifest.now);
const hashOf = (url: string) => urlHash(canonicalUrl(url));

async function seededStore(): Promise<MemoryStore> {
  const store = new MemoryStore();
  // The robotics listing page has been crawled before, so its links are not a first-run baseline.
  await store.saveSourceState('example-robotics', {
    lastOkAt: '2026-10-28T09:30:00.000Z',
    consecutiveFailures: 0,
  });
  return store;
}

function deps(store: Store, overrides: Partial<PipelineDeps> = {}): PipelineDeps {
  const http = new HttpClient({
    userAgent: 'AIShortBot/test',
    fetch: createFixtureFetch(manifest.routes, HTTP_FIXTURES_DIR),
  });
  return {
    sources,
    http,
    articles: new HttpArticleFetcher(http, new RobotsChecker(http, 'AIShortBot')),
    store,
    classifier: new HeuristicClassifier(),
    summarizer: new ExtractiveSummarizer(),
    now,
    log: silentLogger,
    ...overrides,
  };
}

const outage = (): never => {
  throw new AllProvidersFailedError([{ provider: 'gemini', kind: 'rate-limit', message: 'quota' }]);
};

describe('runPipeline (dry-run fixtures)', () => {
  it('turns the fixture sources into the expected cards', async () => {
    const store = await seededStore();
    const report = await runPipeline(deps(store));

    expect(report.sources.every((s) => s.status === 'ok')).toBe(true);
    expect(report.newCards.map((c) => c.headline).sort()).toEqual([
      'A robot hand that learns from video', // listing page: provisional title replaced by the article's
      'Example AI Lab introduces Nova-2, an open-weight reasoning model',
      'Our approach to model safety evaluations',
      'Sparse Mixture Routing for Efficient Language Models', // abstract used without fetching
      'Startup Acme Robotics raises $40 million to bring AI to warehouses',
    ]);
    expect(report.outcomes).toMatchObject({
      'too-old': 2, // lab year-in-review (feed date) + robotics old post (date from the article page)
      'low-points': 2, // HN 20 points + HF 3 upvotes
      'not-ai': 1, // bike lanes from a general source
      'same-url': 1, // HN link to the lab post with ?ref=hn
      'same-story': 1, // press coverage of Nova-2
      'no-text': 1, // HN link whose page 404s and has no description
    });
    expect(report.deferred).toBe(0);
  });

  it('attributes merged stories to the most authoritative source', async () => {
    const store = await seededStore();
    await runPipeline(deps(store));

    const nova = await store.listVisibleCards('2026-10-01T00:00:00.000Z');
    expect(nova.find((c) => c.headline.includes('Nova-2'))).toMatchObject({
      sourceName: 'Example AI Lab',
      sourceUrl: 'https://lab.example.com/news/nova-2',
      imageUrl: 'https://lab.example.com/images/nova-2.png',
    });
    const pressCopy = store.getArticle(
      hashOf('https://news.example.org/2026/10/28/nova-2-open-weight-model'),
    );
    expect(pressCopy).toMatchObject({ status: 'duplicate' });
  });

  it('is idempotent: a second run over the same content creates nothing new', async () => {
    const store = await seededStore();
    await runPipeline(deps(store));
    const second = await runPipeline(deps(store));
    expect(second.newCards).toEqual([]);
    expect(second.counts.unseen).toBe(0);
  });

  it('records a listing page as a baseline on its first successful crawl', async () => {
    const report = await runPipeline(deps(new MemoryStore()));
    expect(report.outcomes['baseline']).toBe(2);
    expect(report.newCards.map((c) => c.headline)).not.toContain(
      'A robot hand that learns from video',
    );
  });

  it('defers everything when the LLM is down during classification, then catches up', async () => {
    const store = await seededStore();
    const down: Classifier = { classify: outage };
    const first = await runPipeline(deps(store, { classifier: down }));
    expect(first).toMatchObject({ llmUnavailable: true, newCards: [] });
    expect(first.deferred).toBeGreaterThan(0);

    const second = await runPipeline(deps(store));
    expect(second.newCards).toHaveLength(5);
  });

  it('keeps cards made before a summarization outage and defers the rest', async () => {
    const store = await seededStore();
    const real = new ExtractiveSummarizer();
    let calls = 0;
    const flaky: Summarizer = {
      summarize: (input) => (++calls <= 2 ? real.summarize(input) : outage()),
    };

    const first = await runPipeline(deps(store, { summarizer: flaky }));
    expect(first.newCards).toHaveLength(2);
    expect(first.llmUnavailable).toBe(true);

    const second = await runPipeline(deps(store));
    expect(second.newCards).toHaveLength(3);
  });

  it('records rejected and unsummarizable stories so they are not retried', async () => {
    const store = await seededStore();
    const reject: Classifier = {
      classify: (items) =>
        Promise.resolve(
          new Map(
            items.map((i) => [
              i.id,
              { isAiNews: false, category: 'products' as const, importance: 1 },
            ]),
          ),
        ),
    };
    const report = await runPipeline(deps(store, { classifier: reject }));
    expect(report.outcomes['not-ai-news']).toBe(5);
    expect(store.getArticle(hashOf('https://lab.example.com/news/nova-2'))).toMatchObject({
      status: 'rejected',
      reason: 'not-ai-news',
    });
    expect((await runPipeline(deps(store))).newCards).toEqual([]);
  });

  it('caps the number of new items per run and leaves the rest for later', async () => {
    const store = await seededStore();
    const first = await runPipeline(deps(store), { maxCandidates: 2 });
    expect(first.newCards.length).toBeLessThanOrEqual(2);
    expect(first.deferred).toBeGreaterThan(0);
    const second = await runPipeline(deps(store));
    expect(first.newCards.length + second.newCards.length).toBe(5);
  });

  it('tracks source health and sends cache validators on the next run', async () => {
    const store = await seededStore();
    const failing = parseSources(
      `sources: [{ id: broken, name: Broken, kind: rss, url: "https://feeds.example.com/missing.xml", weight: 5 }]`,
    );
    await runPipeline(deps(store, { sources: [...sources, ...failing] }));
    await runPipeline(deps(store, { sources: [...sources, ...failing] }));
    expect(await store.getSourceState('broken')).toMatchObject({
      consecutiveFailures: 2,
      lastError: expect.stringContaining('404') as string,
    });
    expect(await store.getSourceState('example-lab')).toMatchObject({
      etag: '"lab-v1"',
      consecutiveFailures: 0,
    });

    const fetch = createFixtureFetch(manifest.routes, HTTP_FIXTURES_DIR);
    const http = new HttpClient({ userAgent: 'AIShortBot/test', fetch });
    await runPipeline(
      deps(store, {
        http,
        articles: new HttpArticleFetcher(http, new RobotsChecker(http, 'AIShortBot')),
      }),
    );
    expect(
      fetch.requests.find((r) => r.url === 'https://feeds.example.com/lab.xml')?.headers[
        'If-None-Match'
      ],
    ).toBe('"lab-v1"');
  });

  it('moves attribution to a heavier source that covers an existing story later', async () => {
    const store = await seededStore();
    const pressOnly = sources.filter((s) => s.id === 'example-tech-news');
    const first = await runPipeline(deps(store, { sources: pressOnly }));
    expect(first.newCards.find((c) => c.headline.includes('Nova-2'))?.sourceName).toBe(
      'Example Tech News',
    );

    await runPipeline(deps(store, { sources }));
    const cards = await store.listVisibleCards('2026-10-01T00:00:00.000Z');
    expect(cards.find((c) => c.headline.includes('Nova-2'))).toMatchObject({
      sourceName: 'Example AI Lab',
      sourceUrl: 'https://lab.example.com/news/nova-2',
    });
    expect(cards.filter((c) => c.headline.includes('Nova-2'))).toHaveLength(1);
  });
});

describe('runPipeline with SupabaseStore (PGlite)', () => {
  it('produces the same cards as the in-memory store and stays idempotent', async () => {
    const { client } = await createTestDatabase();
    try {
      const store = new SupabaseStore(client);
      await store.saveSourceState('example-robotics', {
        lastOkAt: '2026-10-28T09:30:00.000Z',
        consecutiveFailures: 0,
      });

      const first = await runPipeline(deps(store));
      expect(first.newCards).toHaveLength(5);
      expect(first.outcomes).toMatchObject({ 'same-url': 1, 'same-story': 1 });
      expect((await runPipeline(deps(store))).newCards).toEqual([]);

      const cards = await store.listVisibleCards('2026-10-01T00:00:00.000Z');
      expect(cards.find((c) => c.headline.includes('Nova-2'))?.sourceName).toBe('Example AI Lab');
    } finally {
      await client.end();
    }
  }, 60_000);
});
