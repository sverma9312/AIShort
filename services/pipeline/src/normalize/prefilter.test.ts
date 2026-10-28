import { describe, expect, it } from 'vitest';
import type { Source } from '../sources/config';
import type { RawItem } from '../types';
import { isAiRelated, prefilter } from './prefilter';

describe('isAiRelated', () => {
  it.each([
    'OpenAI launches a new model',
    'The AI boom continues',
    'New LLM benchmark released',
    'GPT-5 tops the charts',
    'Researchers train a neural network to fold proteins',
    'Hugging Face acquires a startup',
    'A guide to fine-tuning small models',
    'Nvidia earnings beat expectations',
    'Inside the race for AGI',
  ])('matches %j', (text) => {
    expect(isAiRelated(text)).toBe(true);
  });

  it.each([
    'City council approves new bike lanes',
    'Said the chair, "maintain the course"', // "ai" inside words
    'Html tips for beginners', // lowercase acronym lookalikes
    'Email marketing trends',
  ])('does not match %j', (text) => {
    expect(isAiRelated(text)).toBe(false);
  });
});

describe('prefilter', () => {
  const now = new Date('2026-10-28T10:00:00Z');
  const options = { now, maxAgeHours: 48 };
  const press: Source = {
    id: 'press',
    name: 'Press',
    kind: 'rss',
    url: 'https://p.example.com/feed',
    weight: 6,
    aiFocused: false,
    enabled: true,
  };
  const lab: Source = { ...press, id: 'lab', aiFocused: true };
  const hn: Source = {
    id: 'hn',
    name: 'HN',
    kind: 'hn',
    weight: 4,
    aiFocused: false,
    enabled: true,
    minPoints: 100,
  };
  const item = (overrides: Partial<RawItem> = {}): RawItem => ({
    sourceId: 'press',
    url: 'https://p.example.com/a',
    title: 'OpenAI ships a new model',
    publishedAt: '2026-10-28T08:00:00.000Z',
    ...overrides,
  });

  it('passes a recent AI item', () => {
    expect(prefilter(item(), press, options)).toEqual({ pass: true });
  });

  it('passes undated items (re-checked after extraction)', () => {
    expect(prefilter(item({ publishedAt: undefined }), press, options)).toEqual({ pass: true });
  });

  it('rejects items older than maxAgeHours', () => {
    const old = item({ publishedAt: '2026-10-26T09:59:00.000Z' });
    expect(prefilter(old, press, options)).toEqual({ pass: false, reason: 'too-old' });
  });

  it('accepts slight clock skew but rejects items dated well in the future', () => {
    expect(prefilter(item({ publishedAt: '2026-10-28T10:30:00.000Z' }), press, options).pass).toBe(
      true,
    );
    expect(prefilter(item({ publishedAt: '2026-10-28T12:00:00.000Z' }), press, options)).toEqual({
      pass: false,
      reason: 'future-dated',
    });
  });

  it('rejects non-AI items from general sources but not from AI-focused ones', () => {
    const bikes = item({ title: 'City council approves new bike lanes' });
    expect(prefilter(bikes, press, options)).toEqual({ pass: false, reason: 'not-ai' });
    expect(prefilter(bikes, lab, options)).toEqual({ pass: true });
  });

  it('uses the description for the AI check', () => {
    const subtle = item({
      title: 'The new release is here',
      description: 'A large language model…',
    });
    expect(prefilter(subtle, press, options).pass).toBe(true);
  });

  it('enforces minPoints', () => {
    expect(prefilter(item({ points: 99 }), hn, options)).toEqual({
      pass: false,
      reason: 'low-points',
    });
    expect(prefilter(item({ points: 100 }), hn, options).pass).toBe(true);
    expect(prefilter(item({ points: undefined }), hn, options).pass).toBe(false);
  });
});
