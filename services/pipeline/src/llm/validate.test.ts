import { describe, expect, it } from 'vitest';
import { validateSummary } from './validate';

const source = {
  title: 'Example AI Lab introduces Nova-2',
  sourceName: 'Example AI Lab',
  text:
    'Today Example AI Lab is releasing Nova-2, an open-weight reasoning model with 70 billion parameters. ' +
    'Nova-2 scores 82 percent on the ExampleMath benchmark, up from 64 percent, and answers twice as fast. ' +
    'The weights are available under the Apache 2.0 license from the Example Model Hub. ' +
    'It cost $1,200,000 to train over three weeks.',
};

const good = {
  headline: 'Example AI Lab releases open-weight Nova-2 reasoning model',
  summary:
    'Example AI Lab released Nova-2, an open-weight reasoning model with 70 billion parameters. It scores 82 percent ' +
    'on the ExampleMath benchmark, up from 64 percent, and answers twice as fast. The weights are available under ' +
    'the Apache 2.0 license from the Example Model Hub.',
};

describe('validateSummary', () => {
  it('accepts a grounded card within the limits', () => {
    expect(validateSummary(good, source)).toEqual([]);
  });

  it('flags word-count problems', () => {
    const words = (n: number) => Array.from({ length: n }, () => 'model').join(' ');
    expect(validateSummary({ ...good, headline: words(13) }, source)).toContain(
      'headline has 13 words (max 12)',
    );
    expect(validateSummary({ ...good, summary: words(61) }, source)).toContain(
      'summary has 61 words (max 60)',
    );
    expect(validateSummary({ ...good, summary: words(10) }, source)).toContain(
      'summary has 10 words (min 20)',
    );
    expect(validateSummary({ ...good, headline: ' ' }, source)).toContain('headline is empty');
  });

  it.each([
    [
      'markdown',
      { summary: `**Nova-2** ${good.summary}` },
      'summary contains formatting or line breaks',
    ],
    [
      'line breaks',
      { summary: good.summary.replace('. It', '.\nIt') },
      'summary contains formatting or line breaks',
    ],
    ['bullets', { summary: `- ${good.summary}` }, 'summary contains formatting or line breaks'],
    ['a URL', { summary: `${good.summary} See https://example.com` }, 'summary contains a URL'],
    [
      'meta commentary',
      { summary: `In this article, ${good.summary}` },
      'summary contains meta commentary',
    ],
  ])('flags %s', (_name, override, issue) => {
    expect(validateSummary({ ...good, ...override }, source)).toContain(issue);
  });

  it('flags numbers that are not in the source', () => {
    const issues = validateSummary(
      { ...good, summary: good.summary.replace('82 percent', '91 percent') },
      source,
    );
    expect(issues).toContain('numbers not found in the source: 91');
  });

  it('flags numbers in the headline too', () => {
    expect(
      validateSummary({ ...good, headline: 'Nova-2 tops 95 percent on benchmark' }, source),
    ).toContain('numbers not found in the source: 95');
  });

  it('matches numbers with thousands separators, decimals and spelled-out small numbers', () => {
    const summary = `${good.summary.slice(0, -1)} It cost $1.2M? No: $1200000 over 3 weeks.`;
    const issues = validateSummary({ ...good, summary }, source);
    expect(issues).toEqual(['numbers not found in the source: 1.2']); // 1200000 and 3 (three) are fine
  });

  it('does not mistake unit suffixes like "$40M" or "70B" for names', () => {
    const summary = good.summary.replace('70 billion parameters', '70B parameters');
    expect(validateSummary({ ...good, summary }, source)).toEqual([]);
  });

  it('does not treat a partial number as present', () => {
    // "70" is in the source, "7" alone is not (and is not spelled out).
    const issues = validateSummary(
      { ...good, summary: good.summary.replace('70 billion', '7 billion') },
      source,
    );
    expect(issues).toContain('numbers not found in the source: 7');
  });

  it('flags names that are not in the source', () => {
    const issues = validateSummary(
      {
        ...good,
        summary: good.summary.replace(
          'Example AI Lab released',
          'Example AI Lab, backed by Microsoft, released',
        ),
      },
      source,
    );
    expect(issues).toContain('names not found in the source: Microsoft');
  });

  it('ignores sentence-initial words, possessives and common acronyms', () => {
    const summary =
      "Researchers say Nova-2's results matter for the AI industry. Developers can download the weights under the " +
      'Apache 2.0 license from the Example Model Hub, and the CEO called the 70 billion parameter model a milestone today.';
    expect(validateSummary({ ...good, summary }, source)).toEqual([]);
  });
});
