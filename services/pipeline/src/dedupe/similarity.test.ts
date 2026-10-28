import { describe, expect, it } from 'vitest';
import { groupBySimilarity, titleSimilarity, trigrams } from './similarity';

describe('trigrams', () => {
  it('pads words like pg_trgm', () => {
    expect([...trigrams('Cat')].sort()).toEqual(['  c', ' ca', 'at ', 'cat'].sort());
  });
});

describe('titleSimilarity', () => {
  it('is 1 for identical titles and 0 for unrelated ones', () => {
    expect(titleSimilarity('OpenAI releases a model', 'OpenAI releases a model')).toBe(1);
    expect(titleSimilarity('OpenAI releases a model', 'City approves bike lanes')).toBeLessThan(
      0.1,
    );
  });

  it.each([
    [
      'Example AI Lab introduces Nova-2, an open-weight reasoning model',
      'Example AI Lab releases Nova-2 open-weight reasoning model',
    ],
    [
      'Legora is building the agentic operating system for legal work',
      'Legora is building the agentic operating system for legal work',
    ],
    [
      'Acme Robotics raises $40 million for warehouse AI',
      'Acme Robotics raises $40 million to bring AI to warehouses',
    ],
  ])('rates coverage of the same story as similar: %j', (a, b) => {
    expect(titleSimilarity(a, b)).toBeGreaterThanOrEqual(0.5);
  });

  it.each([
    ['Introducing GPT-6', 'Introducing GPT-7'],
    ['Acme raises $40 million', 'Acme raises $400 million'],
  ])('never matches titles whose numbers differ: %j', (a, b) => {
    expect(titleSimilarity(a, b)).toBe(0);
  });

  it('is case- and punctuation-insensitive', () => {
    expect(titleSimilarity('OPENAI, RELEASES: A MODEL!', 'openai releases a model')).toBe(1);
  });
});

describe('groupBySimilarity', () => {
  it('groups same-story titles and keeps input order inside groups', () => {
    const titles = [
      'Example AI Lab introduces Nova-2, an open-weight reasoning model',
      'Acme Robotics raises $40 million for warehouse AI',
      'Example AI Lab releases Nova-2 open-weight reasoning model',
      'City approves bike lanes',
    ];
    expect(groupBySimilarity(titles, (t) => t, 0.5)).toEqual([
      [titles[0], titles[2]],
      [titles[1]],
      [titles[3]],
    ]);
  });
});
