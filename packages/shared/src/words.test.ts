import { describe, expect, it } from 'vitest';
import { countWords } from './words';

describe('countWords', () => {
  it.each([
    ['', 0],
    ['   ', 0],
    ['one', 1],
    ['two words', 2],
    ['  leading and trailing  ', 3],
    ['tabs\tand\nnewlines', 3],
    ['GPT-5 is open-source', 3],
    ['a — b', 2],
    ['wait … what', 2],
    ['$20 per month', 3],
    ['v2.5 beats 3.1', 3],
    ['Ünïcödé naïve café', 3],
    ['人工知能 ニュース', 2],
  ])('%j → %i', (input, expected) => {
    expect(countWords(input)).toBe(expected);
  });
});
