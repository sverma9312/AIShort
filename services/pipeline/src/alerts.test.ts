import { describe, expect, it } from 'vitest';
import { collectAlerts, dispatchAlerts } from './alerts';
import { silentLogger } from './lib/log';
import type { RunReport } from './run';
import { MemoryStore } from './store/memoryStore';

const report = (overrides: Partial<RunReport> = {}): RunReport => ({
  startedAt: '2026-10-28T10:00:00.000Z',
  sources: [
    { id: 'lab', status: 'ok', items: 3, consecutiveFailures: 0 },
    { id: 'press', status: 'error', items: 0, error: 'HTTP 503', consecutiveFailures: 3 },
    { id: 'blog', status: 'error', items: 0, error: 'HTTP 500', consecutiveFailures: 1 },
  ],
  counts: { fetched: 3, unseen: 3, extracted: 3, stories: 3, classified: 3, cards: 2 },
  outcomes: {},
  deferred: 0,
  llmUnavailable: false,
  newCards: [],
  ...overrides,
});

function webhook() {
  const posts: string[] = [];
  const fetch = (_url: string, init?: RequestInit) => {
    posts.push((JSON.parse(init?.body as string) as { content: string }).content);
    return Promise.resolve(new Response(null, { status: 204 }));
  };
  return { posts, fetch };
}

describe('collectAlerts', () => {
  it('flags sources at the failure threshold and LLM outages', () => {
    expect(collectAlerts(report({ llmUnavailable: true, deferred: 7 })).map((a) => a.key)).toEqual([
      'source-failing:press',
      'llm-unavailable',
    ]);
  });

  it('flags a run where every source failed', () => {
    const allFailed = report({
      sources: [{ id: 'a', status: 'error', items: 0, consecutiveFailures: 1 }],
    });
    expect(collectAlerts(allFailed).map((a) => a.key)).toEqual(['all-sources-failed']);
  });

  it('is quiet for a healthy run', () => {
    expect(
      collectAlerts(
        report({ sources: [{ id: 'a', status: 'ok', items: 1, consecutiveFailures: 0 }] }),
      ),
    ).toEqual([]);
  });
});

describe('dispatchAlerts', () => {
  const alert = { key: 'llm-unavailable', message: 'No LLM provider was available' };

  it('posts to the webhook once per cooldown', async () => {
    const store = new MemoryStore();
    const { posts, fetch } = webhook();
    const deps = {
      store,
      log: silentLogger,
      webhookUrl: 'https://discord.example.com/hook',
      fetch,
    };

    await dispatchAlerts([alert], { ...deps, now: new Date('2026-10-28T10:00:00Z') });
    await dispatchAlerts([alert], { ...deps, now: new Date('2026-10-28T12:00:00Z') });
    await dispatchAlerts([alert], { ...deps, now: new Date('2026-10-28T16:30:00Z') });

    expect(posts).toHaveLength(2);
    expect(posts[0]).toContain('No LLM provider was available');
  });

  it('announces recovery once and then re-alerts immediately if the problem returns', async () => {
    const store = new MemoryStore();
    const { posts, fetch } = webhook();
    const deps = {
      store,
      log: silentLogger,
      webhookUrl: 'https://discord.example.com/hook',
      fetch,
    };

    await dispatchAlerts([alert], { ...deps, now: new Date('2026-10-28T10:00:00Z') });
    const resolved = await dispatchAlerts([], { ...deps, now: new Date('2026-10-28T10:30:00Z') });
    await dispatchAlerts([], { ...deps, now: new Date('2026-10-28T11:00:00Z') });
    await dispatchAlerts([alert], { ...deps, now: new Date('2026-10-28T11:30:00Z') });

    expect(resolved.recovered).toEqual(['llm-unavailable']);
    expect(posts.map((p) => (p.includes('resolved') ? 'resolved' : 'alert'))).toEqual([
      'alert',
      'resolved',
      'alert',
    ]);
  });

  it('only logs without a webhook, and never throws when the webhook fails', async () => {
    const store = new MemoryStore();
    await expect(
      dispatchAlerts([alert], { store, log: silentLogger, now: new Date() }),
    ).resolves.toMatchObject({ sent: ['llm-unavailable'] });

    const failing = () => Promise.reject(new Error('network down'));
    await expect(
      dispatchAlerts([{ ...alert, key: 'other' }], {
        store,
        log: silentLogger,
        now: new Date(),
        webhookUrl: 'https://x.example.com',
        fetch: failing,
      }),
    ).resolves.toMatchObject({ sent: [] });
  });
});
