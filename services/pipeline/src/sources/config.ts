import { readFile } from 'node:fs/promises';
import { CategorySchema } from '@aishort/shared';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

const base = {
  id: z.string().regex(/^[a-z0-9-]+$/, 'Use lowercase letters, digits and dashes'),
  name: z.string().min(1),
  /** Authority 1–10: the highest-weight source becomes the card's source when stories merge. */
  weight: z.number().int().min(1).max(10),
  /** The source only publishes AI content, so the AI keyword filter is skipped. */
  aiFocused: z.boolean().default(false),
  enabled: z.boolean().default(true),
  categoryHint: CategorySchema.optional(),
  /** Minimum community score (HN points, HF upvotes) for an item to be considered. */
  minPoints: z.number().int().min(0).optional(),
};

const webUrl = z.url({ protocol: /^https?$/ });

export const SourceSchema = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('rss'), url: webUrl }),
  z.object({ ...base, kind: z.literal('hn') }),
  z.object({ ...base, kind: z.literal('hf-papers') }),
  z.object({
    ...base,
    kind: z.literal('html'),
    url: webUrl,
    /** Regex an article link's pathname must match, e.g. "^/news/[a-z0-9-]+/?$". */
    linkPattern: z.string().refine(isValidRegex, 'Invalid regular expression'),
    /** Pathnames to ignore even if they match (category pages, …). */
    exclude: z.array(z.string()).default([]),
    /** Listing pages have no dates, so only the first N links (newest first) are considered. */
    maxItems: z.number().int().min(1).max(50).default(10),
  }),
]);

export type Source = z.infer<typeof SourceSchema>;
export type SourceKind = Source['kind'];

const SourcesFileSchema = z
  .object({ sources: z.array(SourceSchema).min(1) })
  .superRefine(({ sources }, ctx) => {
    const seen = new Set<string>();
    sources.forEach((source, index) => {
      if (seen.has(source.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate source id "${source.id}"`,
          path: ['sources', index, 'id'],
        });
      }
      seen.add(source.id);
    });
  });

export function parseSources(yamlText: string): Source[] {
  return SourcesFileSchema.parse(parseYaml(yamlText)).sources;
}

export async function loadSources(path: string): Promise<Source[]> {
  return parseSources(await readFile(path, 'utf8'));
}

function isValidRegex(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}
