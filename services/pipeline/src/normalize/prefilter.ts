import { hoursBefore } from '../lib/time';
import type { Source } from '../sources/config';
import type { RawItem } from '../types';

// Acronyms are matched case-sensitively so "ai" inside other words or "Ml" don't count.
const AI_ACRONYMS = /\b(AI|A\.I\.|AGI|LLMs?|GenAI|ML|NLP|RLHF|GPT-?\d*)\b/;
const AI_TERMS = new RegExp(
  '\\b(' +
    [
      'artificial intelligence',
      'machine learning',
      'deep learning',
      'neural net(work)?s?',
      '(large )?language models?',
      'foundation models?',
      'frontier models?',
      'reasoning models?',
      'generative',
      'chatbots?',
      'ai agents?',
      'agentic',
      'transformers?',
      'diffusion models?',
      'reinforcement learning',
      'computer vision',
      'speech recognition',
      'text-to-(image|video|speech)',
      'open-weights?',
      'fine-tun(e|ed|ing)',
      'inference',
      'openai',
      'anthropic',
      'deepmind',
      'mistral',
      'hugging ?face',
      'chatgpt',
      'claude',
      'gemini',
      'llama',
      'copilot',
      'grok',
      'deepseek',
      'qwen',
      'midjourney',
      'stable diffusion',
      'nvidia',
    ].join('|') +
    ')\\b',
  'i',
);

export function isAiRelated(text: string): boolean {
  return AI_ACRONYMS.test(text) || AI_TERMS.test(text);
}

export type PrefilterResult =
  { pass: true } | { pass: false; reason: 'too-old' | 'future-dated' | 'low-points' | 'not-ai' };

export interface PrefilterOptions {
  now: Date;
  maxAgeHours: number;
}

/** Cheap checks that run before any article is fetched or any LLM is called. */
export function prefilter(
  item: RawItem,
  source: Source,
  options: PrefilterOptions,
): PrefilterResult {
  const ageResult = checkAge(item.publishedAt, options);
  if (ageResult) return ageResult;

  if (source.minPoints !== undefined && (item.points ?? 0) < source.minPoints) {
    return { pass: false, reason: 'low-points' };
  }
  if (!source.aiFocused && !isAiRelated(`${item.title} ${item.description ?? ''}`)) {
    return { pass: false, reason: 'not-ai' };
  }
  return { pass: true };
}

/**
 * Items without a date pass (some feeds omit it); the date is re-checked after extraction.
 * A small clock-skew allowance is made for items dated slightly in the future.
 */
export function checkAge(
  publishedAt: string | undefined,
  { now, maxAgeHours }: PrefilterOptions,
): Extract<PrefilterResult, { pass: false }> | undefined {
  if (!publishedAt) return undefined;
  const published = new Date(publishedAt).getTime();
  if (published < hoursBefore(now, maxAgeHours).getTime())
    return { pass: false, reason: 'too-old' };
  if (published > now.getTime() + 3_600_000) return { pass: false, reason: 'future-dated' };
  return undefined;
}
