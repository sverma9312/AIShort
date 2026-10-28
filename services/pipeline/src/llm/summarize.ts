import { HEADLINE_MAX_WORDS, SUMMARY_MAX_WORDS, countWords } from '@aishort/shared';
import { z } from 'zod';
import type { JsonLlm } from './chain';
import { SUMMARIZE_SYSTEM, summarizeRetryPrompt, summarizeUserPrompt } from './prompts';
import { validateSummary, type SummaryDraft } from './validate';

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
      const draft = { headline: tidyHeadline(data.headline), summary: data.summary.trim() };
      issues = validateSummary(draft, input);
      if (issues.length === 0) return { ok: true, ...draft, provider, attempts: attempt };
      previous = draft;
    }
    return { ok: false, issues, attempts: this.maxAttempts };
  }
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
