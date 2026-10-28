import { CategorySchema, type Category } from '@aishort/shared';
import { z } from 'zod';
import { truncate } from '../lib/text';
import { isAiRelated } from '../normalize/prefilter';
import type { JsonLlm } from './chain';
import { CLASSIFY_SYSTEM, classifyUserPrompt } from './prompts';

export interface ClassifyInput {
  id: string;
  title: string;
  excerpt: string;
  sourceName: string;
  categoryHint?: Category;
}

export interface Classification {
  isAiNews: boolean;
  category: Category;
  importance: number;
}

export interface Classifier {
  /** Classifies one batch. Ids missing from the result could not be classified. */
  classify(items: ClassifyInput[]): Promise<Map<string, Classification>>;
}

const ClassifyResponseSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      isAiNews: z.boolean(),
      category: CategorySchema,
      importance: z.number().int().min(1).max(10),
    }),
  ),
});

export class LlmClassifier implements Classifier {
  constructor(private readonly llm: JsonLlm) {}

  async classify(items: ClassifyInput[]): Promise<Map<string, Classification>> {
    if (items.length === 0) return new Map();
    const { data } = await this.llm.completeJson(
      {
        system: CLASSIFY_SYSTEM,
        user: classifyUserPrompt(
          items.map((item) => ({
            id: item.id,
            source: item.sourceName,
            title: item.title,
            excerpt: truncate(item.excerpt, 400),
            ...(item.categoryHint ? { hint: item.categoryHint } : {}),
          })),
        ),
        maxOutputTokens: 120 + 60 * items.length,
        temperature: 0,
      },
      ClassifyResponseSchema,
    );
    const wanted = new Set(items.map((item) => item.id));
    return new Map(
      data.results
        .filter((result) => wanted.has(result.id))
        .map(({ id, ...classification }) => [id, classification]),
    );
  }
}

/** Keyword-based classifier for the offline dry run: deterministic, no API calls. */
export class HeuristicClassifier implements Classifier {
  classify(items: ClassifyInput[]): Promise<Map<string, Classification>> {
    return Promise.resolve(
      new Map(
        items.map((item) => {
          const text = `${item.title} ${item.excerpt}`;
          const launch = /\b(introduc|launch|releas|unveil|announc)/i.test(text);
          return [
            item.id,
            {
              isAiNews: Boolean(item.categoryHint) || isAiRelated(text),
              category:
                item.categoryHint ??
                guessCategory(item.title) ??
                guessCategory(item.excerpt) ??
                'products',
              importance: Math.min(10, 5 + (launch ? 2 : 0)),
            },
          ];
        }),
      ),
    );
  }
}

function guessCategory(text: string): Category | undefined {
  if (/\b(raises?|funding|acquir\w*|valuation|series [a-f]|ipo|earnings)\b/i.test(text))
    return 'business';
  if (/\b(laws?|regulat\w*|policy|safety|ethic\w*|lawsuits?|copyright|government)\b/i.test(text))
    return 'policy';
  if (/\b(paper|study|researchers?|benchmark|arxiv)\b/i.test(text)) return 'research';
  if (/\bopen[- ](weights?|source)\b/i.test(text)) return 'open-source';
  if (/\bmodels?\b/i.test(text)) return 'models';
  return undefined;
}
