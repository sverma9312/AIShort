import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HTTP_FIXTURES_DIR } from '../testing';
import { parseHfPapers } from './hfPapers';

describe('parseHfPapers', () => {
  const json: unknown = JSON.parse(readFileSync(join(HTTP_FIXTURES_DIR, 'hf-papers.json'), 'utf8'));

  it('maps papers to items linking to the Hugging Face paper page', () => {
    const [first, second] = parseHfPapers(json);
    expect(first).toMatchObject({
      url: 'https://huggingface.co/papers/2610.00001',
      title: 'Sparse Mixture Routing for Efficient Language Models',
      points: 42,
      publishedAt: '2026-10-27T20:00:00.000Z',
      imageUrl: 'https://cdn.example.com/thumbs/2610.00001.png',
    });
    expect(first?.description?.length).toBeGreaterThan(600);
    expect(second).not.toHaveProperty('imageUrl');
  });

  it('rejects an unexpected response shape', () => {
    expect(() => parseHfPapers({ papers: [] })).toThrow();
  });
});
