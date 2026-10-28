import { describe, expect, it } from 'vitest';
import { parseJsonObject } from './json';

describe('parseJsonObject', () => {
  it.each([
    ['plain JSON', '{"a":1}'],
    ['a fenced block', 'Here you go:\n```json\n{"a":1}\n```'],
    ['an unlabelled fence', '```\n{"a":1}\n```'],
    ['surrounding text', 'Sure! {"a":1} Hope that helps.'],
  ])('parses %s', (_name, text) => {
    expect(parseJsonObject(text)).toEqual({ a: 1 });
  });

  it.each(['', 'no json here', '{broken', '"just a string"', '42'])(
    'returns undefined for %j',
    (text) => {
      expect(parseJsonObject(text)).toBeUndefined();
    },
  );
});
