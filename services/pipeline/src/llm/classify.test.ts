import { describe, expect, it } from 'vitest';
import { ProviderChain } from './chain';
import { HeuristicClassifier, LlmClassifier } from './classify';
import { ScriptedProvider } from './scriptedProvider';

const items = [
  { id: 'k1', title: 'Lab releases model', excerpt: 'A new model.', sourceName: 'Lab' },
  {
    id: 'k2',
    title: 'Paper on attention',
    excerpt: 'x'.repeat(2000),
    sourceName: 'Papers',
    categoryHint: 'research' as const,
  },
];

describe('LlmClassifier', () => {
  it('sends a compact batch and maps results by id, ignoring unknown ids', async () => {
    const provider = new ScriptedProvider('a', [
      JSON.stringify({
        results: [
          { id: 'k1', isAiNews: true, category: 'models', importance: 8 },
          { id: 'k2', isAiNews: true, category: 'research', importance: 5 },
          { id: 'zzz', isAiNews: true, category: 'models', importance: 9 },
        ],
      }),
    ]);
    const result = await new LlmClassifier(new ProviderChain([provider])).classify(items);

    expect([...result.keys()]).toEqual(['k1', 'k2']);
    expect(result.get('k1')).toEqual({ isAiNews: true, category: 'models', importance: 8 });

    const sent = JSON.parse(provider.requests[0]!.user) as {
      id: string;
      excerpt: string;
      hint?: string;
    }[];
    expect(sent.map((s) => s.id)).toEqual(['k1', 'k2']);
    expect(sent[1]?.excerpt.length).toBeLessThanOrEqual(400);
    expect(sent[1]?.hint).toBe('research');
    expect(provider.requests[0]?.temperature).toBe(0);
  });

  it('returns no entry for ids the model skipped', async () => {
    const provider = new ScriptedProvider('a', [
      JSON.stringify({
        results: [{ id: 'k1', isAiNews: false, category: 'products', importance: 2 }],
      }),
    ]);
    const result = await new LlmClassifier(new ProviderChain([provider])).classify(items);
    expect(result.has('k2')).toBe(false);
  });

  it('rejects invalid categories or importance via the schema', async () => {
    const bad = JSON.stringify({
      results: [{ id: 'k1', isAiNews: true, category: 'gossip', importance: 99 }],
    });
    const chain = new ProviderChain([new ScriptedProvider('a', [bad])]);
    await expect(new LlmClassifier(chain).classify(items)).rejects.toThrow(
      /All LLM providers failed/,
    );
  });

  it('does not call the LLM for an empty batch', async () => {
    const provider = new ScriptedProvider('a', ['{}']);
    await new LlmClassifier(new ProviderChain([provider])).classify([]);
    expect(provider.requests).toHaveLength(0);
  });
});

describe('HeuristicClassifier', () => {
  it('classifies deterministically without network access', async () => {
    const result = await new HeuristicClassifier().classify([
      {
        id: 'a',
        title: 'Startup raises $40 million for AI robots',
        excerpt: '',
        sourceName: 'News',
      },
      { id: 'b', title: 'Lab introduces a new language model', excerpt: '', sourceName: 'Lab' },
      { id: 'c', title: 'City council approves bike lanes', excerpt: '', sourceName: 'News' },
    ]);
    expect(result.get('a')).toMatchObject({ isAiNews: true, category: 'business' });
    expect(result.get('b')).toMatchObject({ isAiNews: true, category: 'models', importance: 7 });
    expect(result.get('c')?.isAiNews).toBe(false);
  });

  it('guesses the category from the title before the body', async () => {
    const result = await new HeuristicClassifier().classify([
      {
        id: 'a',
        title: 'Lab introduces a new language model',
        excerpt: 'It passed our safety tests.',
        sourceName: 'Lab',
      },
      { id: 'b', title: 'Big Co acquires an AI startup', excerpt: '', sourceName: 'News' },
      { id: 'c', title: 'New AI regulations take effect', excerpt: '', sourceName: 'News' },
    ]);
    expect([...result.values()].map((c) => c.category)).toEqual(['models', 'business', 'policy']);
  });
});
