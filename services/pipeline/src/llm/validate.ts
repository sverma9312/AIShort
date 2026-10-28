import { countWords, HEADLINE_MAX_WORDS, SUMMARY_MAX_WORDS } from '@aishort/shared';

export const SUMMARY_MIN_WORDS = 20;

export interface SummaryDraft {
  headline: string;
  summary: string;
}

export interface SummarySource {
  title: string;
  sourceName: string;
  text: string;
}

const BANNED =
  /\b(as an ai|i cannot|i can't|i'm sorry|language model developed by|in this article|the article (says|states|discusses|describes)|according to the article|this article)\b/i;
const FORMATTING = /[*#`_~|]|\n|^\s*[-•]\s/m;
const URL = /\bhttps?:\/\/|\bwww\./i;

/** Capitalized words that are common in AI news and don't need to appear in the source. */
const ALWAYS_ALLOWED = new Set([
  'ai',
  'agi',
  'api',
  'apis',
  'ceo',
  'cto',
  'cfo',
  'coo',
  'gpu',
  'gpus',
  'cpu',
  'cpus',
  'llm',
  'llms',
  'us',
  'u.s',
  'uk',
  'eu',
  'un',
  'i',
  'it',
  'the',
  'a',
  'an',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]);

const NUMBER_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
];

/**
 * Checks a drafted card against product rules and against the source text.
 * Returns human-readable problems (fed back to the model on retry); empty means valid.
 *
 * Grounding is a cheap guard against invented facts: every number in the card, and every
 * capitalized name in the summary, must appear in the source title or text.
 */
export function validateSummary(draft: SummaryDraft, source: SummarySource): string[] {
  const issues: string[] = [];
  const headline = draft.headline.trim();
  const summary = draft.summary.trim();

  const headlineWords = countWords(headline);
  if (headlineWords === 0) issues.push('headline is empty');
  if (headlineWords > HEADLINE_MAX_WORDS)
    issues.push(`headline has ${headlineWords} words (max ${HEADLINE_MAX_WORDS})`);

  const summaryWords = countWords(summary);
  if (summaryWords > SUMMARY_MAX_WORDS)
    issues.push(`summary has ${summaryWords} words (max ${SUMMARY_MAX_WORDS})`);
  if (summaryWords < SUMMARY_MIN_WORDS)
    issues.push(`summary has ${summaryWords} words (min ${SUMMARY_MIN_WORDS})`);

  for (const [label, value] of [
    ['headline', headline],
    ['summary', summary],
  ] as const) {
    if (FORMATTING.test(value)) issues.push(`${label} contains formatting or line breaks`);
    if (URL.test(value)) issues.push(`${label} contains a URL`);
    if (BANNED.test(value)) issues.push(`${label} contains meta commentary`);
  }

  const reference = `${source.title}\n${source.sourceName}\n${source.text}`;
  const missingNumbers = numbersIn(`${headline} ${summary}`).filter(
    (n) => !hasNumber(reference, n),
  );
  if (missingNumbers.length)
    issues.push(`numbers not found in the source: ${unique(missingNumbers).join(', ')}`);

  const missingNames = namesIn(summary).filter((name) => !hasWord(reference, name));
  if (missingNames.length)
    issues.push(`names not found in the source: ${unique(missingNames).join(', ')}`);

  return issues;
}

function numbersIn(text: string): string[] {
  return (text.match(/\d[\d,.]*/g) ?? [])
    .map((n) => n.replace(/,/g, '').replace(/\.+$/, ''))
    .filter(Boolean);
}

function hasNumber(reference: string, number: string): boolean {
  const normalized = reference.replace(/(\d),(?=\d{3})/g, '$1');
  if (new RegExp(`(?<![\\d.])${escape(number)}(?![\\d]|\\.\\d)`).test(normalized)) return true;
  const small = Number(number);
  return (
    Number.isInteger(small) &&
    small <= 10 &&
    new RegExp(`\\b${NUMBER_WORDS[small]}\\b`, 'i').test(reference)
  );
}

/** Capitalized words that are not at the start of a sentence, minus possessives. */
function namesIn(text: string): string[] {
  const names: string[] = [];
  // Must start a token: the "M" in "$40M" or the "B" in "70B" is not a name.
  const pattern = /(?<![\p{L}\p{N}])[\p{Lu}][\p{L}\p{N}]*(?:[-.'’][\p{L}\p{N}]+)*/gu;
  for (const match of text.matchAll(pattern)) {
    const before = text.slice(0, match.index).trimEnd();
    if (before === '' || /[.!?:;"“(]$/.test(before)) continue;
    const word = match[0].replace(/['’]s$/u, '');
    if (!ALWAYS_ALLOWED.has(word.toLowerCase())) names.push(word);
  }
  return names;
}

function hasWord(reference: string, word: string): boolean {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escape(word)}(?![\\p{L}\\p{N}])`, 'iu').test(reference);
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
