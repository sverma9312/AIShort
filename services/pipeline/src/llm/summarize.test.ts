import { describe, expect, it } from 'vitest';
import { ProviderChain } from './chain';
import { ScriptedProvider } from './scriptedProvider';
import { ExtractiveSummarizer, LlmSummarizer } from './summarize';

const input = {
  title: 'Example AI Lab introduces Nova-2',
  sourceName: 'Example AI Lab',
  text:
    'Today Example AI Lab is releasing Nova-2, an open-weight reasoning model with 70 billion parameters. ' +
    'Nova-2 scores 82 percent on the ExampleMath benchmark, up from 64 percent, and answers twice as fast. ' +
    'The weights are available under the Apache 2.0 license from the Example Model Hub starting today.',
};

const goodSummary =
  'Example AI Lab released Nova-2, an open-weight reasoning model with 70 billion parameters. It scores 82 percent ' +
  'on the ExampleMath benchmark, up from 64 percent, and answers twice as fast. The weights are available under ' +
  'the Apache 2.0 license.';
const reply = (headline: string, summary: string) => JSON.stringify({ headline, summary });

describe('LlmSummarizer', () => {
  it('returns a valid card on the first attempt, tidying the headline', async () => {
    const provider = new ScriptedProvider('a', [
      reply('"Example AI Lab releases Nova-2."', goodSummary),
    ]);
    const result = await new LlmSummarizer(new ProviderChain([provider])).summarize(input);
    expect(result).toEqual({
      ok: true,
      headline: 'Example AI Lab releases Nova-2',
      summary: goodSummary,
      provider: 'a',
      attempts: 1,
    });
    expect(provider.requests[0]?.user).toContain('Article text:');
  });

  it('retries once with the problems listed, then succeeds', async () => {
    const invented = goodSummary.replace('82 percent', '97 percent');
    const provider = new ScriptedProvider('a', [
      reply('Nova-2 launches', invented),
      reply('Nova-2 launches', goodSummary),
    ]);
    const result = await new LlmSummarizer(new ProviderChain([provider])).summarize(input);

    expect(result).toMatchObject({ ok: true, attempts: 2 });
    expect(provider.requests[1]?.user).toContain('numbers not found in the source: 97');
    expect(provider.requests[1]?.user).toContain(invented);
  });

  it('gives up after the retry and reports the problems', async () => {
    const provider = new ScriptedProvider('a', [reply('Nova-2', 'Too short.')]);
    const result = await new LlmSummarizer(new ProviderChain([provider])).summarize(input);
    expect(result).toMatchObject({
      ok: false,
      attempts: 2,
      issues: ['summary has 2 words (min 20)'],
    });
  });

  it('propagates provider outages so the item can be retried next run', async () => {
    const chain = new ProviderChain([new ScriptedProvider('a', [{ error: 'rate-limit' }])]);
    await expect(new LlmSummarizer(chain).summarize(input)).rejects.toThrow(
      /All LLM providers failed/,
    );
  });
});

describe('ExtractiveSummarizer', () => {
  it('builds a grounded card from leading sentences within 60 words', async () => {
    const result = await new ExtractiveSummarizer().summarize(input);
    expect(result).toMatchObject({
      ok: true,
      provider: 'offline',
      headline: 'Example AI Lab introduces Nova-2',
    });
    expect(result.ok && result.summary.startsWith('Today Example AI Lab is releasing Nova-2')).toBe(
      true,
    );
  });

  it('keeps decimals such as "Apache 2.0" inside one sentence', async () => {
    const result = await new ExtractiveSummarizer().summarize(input);
    expect(result.ok && result.summary).toContain('Apache 2.0 license');
  });

  it('fails when the text is too short for a summary', async () => {
    const result = await new ExtractiveSummarizer().summarize({ ...input, text: 'Short.' });
    expect(result.ok).toBe(false);
  });
});
