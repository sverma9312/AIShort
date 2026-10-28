import latest from '@aishort/shared/fixtures/latest.valid.json';
import { loadSnapshot, refreshSnapshot } from '../feedRepository';
import { memoryStorage, STORAGE_KEYS } from '../storage';

const BASE = 'https://a.example.com/AIShort';
const respond = (status: number, body?: unknown, etag?: string) => () =>
  Promise.resolve(
    new Response(status === 304 ? null : JSON.stringify(body), {
      status,
      headers: etag ? { etag } : {},
    }),
  );

describe('feed snapshot', () => {
  it('saves a fresh feed and reports new cards on the next refresh', async () => {
    const store = memoryStorage();
    const first = await refreshSnapshot({
      store,
      baseUrls: [BASE],
      fetch: respond(200, { ...latest, cards: latest.cards.slice(1) }, '"v1"'),
    });
    expect(first).toMatchObject({ changed: true, newCardIds: [] });
    expect(await loadSnapshot(store)).toMatchObject({ etag: '"v1"', baseUrl: BASE });

    const second = await refreshSnapshot({
      store,
      baseUrls: [BASE],
      previous: first.snapshot,
      fetch: respond(200, latest, '"v2"'),
    });
    expect(second.newCardIds).toEqual([latest.cards[0]?.id]);
  });

  it('keeps the cached feed on 304 and updates the check time', async () => {
    const store = memoryStorage();
    const { snapshot } = await refreshSnapshot({
      store,
      baseUrls: [BASE],
      fetch: respond(200, latest, '"v1"'),
      now: new Date('2026-10-28T10:00:00Z'),
    });
    const result = await refreshSnapshot({
      store,
      baseUrls: [BASE],
      previous: snapshot,
      fetch: respond(304),
      now: new Date('2026-10-28T11:00:00Z'),
    });
    expect(result).toMatchObject({
      changed: false,
      snapshot: { checkedAt: '2026-10-28T11:00:00.000Z', etag: '"v1"' },
    });
  });

  it('ignores a corrupt or outdated cache', async () => {
    expect(await loadSnapshot(memoryStorage({ [STORAGE_KEYS.feed]: '{not json' }))).toBeUndefined();
    expect(
      await loadSnapshot(
        memoryStorage({ [STORAGE_KEYS.feed]: JSON.stringify({ feed: { version: 99 } }) }),
      ),
    ).toBeUndefined();
  });
});
