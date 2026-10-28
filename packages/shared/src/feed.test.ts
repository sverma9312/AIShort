import { describe, expect, it } from 'vitest';
import latest from '../fixtures/latest.valid.json';
import { parseFeedLenient } from './feed';

describe('parseFeedLenient', () => {
  it('returns every card from a valid feed', () => {
    const result = parseFeedLenient(latest);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.feed.cards).toHaveLength(latest.cards.length);
    expect(result.droppedCount).toBe(0);
  });

  it('drops invalid cards but keeps the valid ones', () => {
    const [first, second] = latest.cards;
    const input = {
      ...latest,
      cards: [first, { ...second, sourceUrl: 'javascript:alert(1)' }, 'not a card', null],
    };

    const result = parseFeedLenient(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.feed.cards.map((c) => c.id)).toEqual([first?.id]);
    expect(result.droppedCount).toBe(3);
  });

  it.each<[string, unknown]>([
    ['null', null],
    ['an array', []],
    ['an unsupported version', { ...latest, version: 2 }],
    ['a missing generatedAt', { version: 1, cards: [] }],
    ['cards that are not an array', { ...latest, cards: {} }],
  ])('fails for %s', (_name, input) => {
    expect(parseFeedLenient(input).ok).toBe(false);
  });
});
