import { HEADLINE_MAX_WORDS, SUMMARY_MAX_WORDS, countWords } from '@aishort/shared';
import { z } from 'zod';
import type { JsonLlm } from './chain';
import { SUMMARIZE_SYSTEM, summarizeRetryPrompt, summarizeUserPrompt } from './prompts';
import { validateSummary, SUMMARY_MIN_WORDS, type SummaryDraft } from './validate';

export interface SummarizeInput {
  title: string;
  sourceName: string;
  text: string;
}

export type SummarizeResult =
  | { ok: true; headline: string; summary: string; provider: string; attempts: number }
  | { ok: false; issues: string[]; attempts: number };

export interface Summarizer {
  /** Throws AllProvidersFailedError when no LLM is reachable (retry on a later run). */
  summarize(input: SummarizeInput): Promise<SummarizeResult>;
}

const DraftSchema = z.object({ headline: z.string(), summary: z.string() });

/** Summarizes with an LLM, validates the result, and retries once with the problems listed. */
export class LlmSummarizer implements Summarizer {
  constructor(
    private readonly llm: JsonLlm,
    private readonly maxAttempts = 2,
  ) {}

  async summarize(input: SummarizeInput): Promise<SummarizeResult> {
    let previous: SummaryDraft | undefined;
    let issues: string[] = [];

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const { data, provider } = await this.llm.completeJson(
        {
          system: SUMMARIZE_SYSTEM,
          user: previous
            ? summarizeRetryPrompt(input, previous, issues)
            : summarizeUserPrompt(input),
          maxOutputTokens: 400,
          temperature: attempt === 1 ? 0.3 : 0.1,
        },
        DraftSchema,
      );
      const rawHeadline = tidyHeadline(data.headline);
      const rawSummary = data.summary.trim();
      const draft = {
        headline:
          countWords(rawHeadline) > HEADLINE_MAX_WORDS
            ? fitHeadlineWords(rawHeadline)
            : rawHeadline,
        summary:
          countWords(rawSummary) > SUMMARY_MAX_WORDS ? fitSummaryWords(rawSummary) : rawSummary,
      };
      issues = validateSummary(draft, input);
      if (issues.length === 0) return { ok: true, ...draft, provider, attempts: attempt };
      previous = draft;
    }
    return { ok: false, issues, attempts: this.maxAttempts };
  }
}

export function fitSummaryWords(
  summary: string,
  maxWords: number = SUMMARY_MAX_WORDS,
  minWords: number = SUMMARY_MIN_WORDS,
): string {
  if (countWords(summary) <= maxWords) return summary;

  // 1. Try taking complete sentences if they add up to between minWords and maxWords
  const sentences = summary.match(/[^.!?]+[.!?]+["'”)]?/g);
  if (sentences && sentences.length > 1) {
    let candidate = '';
    for (const sentence of sentences) {
      const next = candidate ? `${candidate} ${sentence.trim()}` : sentence.trim();
      if (countWords(next) <= maxWords) {
        candidate = next;
      } else {
        break;
      }
    }
    if (candidate && countWords(candidate) >= minWords && countWords(candidate) <= maxWords) {
      return candidate;
    }
  }

  // 2. Otherwise trim cleanly at word boundary and terminate with period
  const words = summary.trim().split(/\s+/u);
  const trimmed = words
    .slice(0, maxWords)
    .join(' ')
    .replace(/[,;:\-\s]+$/, '');
  return /[.!?]["'”)]?$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export function fitHeadlineWords(headline: string, maxWords: number = HEADLINE_MAX_WORDS): string {
  const trimmed = tidyHeadline(headline);
  if (countWords(trimmed) <= maxWords) return trimmed;
  const words = trimmed.split(/\s+/u);
  return words
    .slice(0, maxWords)
    .join(' ')
    .replace(/[,;:\-\s]+$/, '');
}

/**
 * Offline summarizer for the dry run: the title as headline and the leading sentences of the
 * text as summary. Grounded by construction; checked by the same validator as LLM output.
 */
export class ExtractiveSummarizer implements Summarizer {
  summarize(input: SummarizeInput): Promise<SummarizeResult> {
    const headline = tidyHeadline(input.title.split(/\s+/).slice(0, HEADLINE_MAX_WORDS).join(' '));
    let summary = '';
    // Paragraphs without final punctuation are headings; skip them. Split sentences only where
    // punctuation is followed by whitespace, so "2.0" or "U.S." stay intact.
    const prose = input.text
      .split(/\n{2,}/)
      .filter((paragraph) => /[.!?]["”')]?$/.test(paragraph.trim()))
      .join(' ');
    for (const sentence of prose.split(/(?<=[.!?])\s+/u)) {
      const next = `${summary} ${sentence.trim()}`.trim();
      if (countWords(next) > SUMMARY_MAX_WORDS) break;
      summary = next;
    }
    const draft = { headline, summary };
    const issues = validateSummary(draft, input);
    return Promise.resolve(
      issues.length
        ? { ok: false, issues, attempts: 1 }
        : { ok: true, ...draft, provider: 'offline', attempts: 1 },
    );
  }
}

function tidyHeadline(headline: string): string {
  return headline
    .trim()
    .replace(/^["“]|["”]$/g, '')
    .replace(/\.$/, '');
}
