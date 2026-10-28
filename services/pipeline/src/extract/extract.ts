import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import { collapseWhitespace, truncate } from '../lib/text';
import { toIsoUtc } from '../lib/time';
import { toWebUrl } from '../lib/url';

export interface ExtractedArticle {
  /** Main article text, whitespace-collapsed and truncated; empty if none was found. */
  text: string;
  title?: string;
  imageUrl?: string;
  publishedAt?: string;
}

export interface ExtractOptions {
  /** Upper bound on text kept for summarization (keeps LLM prompts small). */
  maxChars?: number;
  /** Shorter extracted text is treated as "no article found" (cookie walls, paywalls, …). */
  minChars?: number;
}

/** Extracts the readable article text and metadata from an HTML page. Pure: no network. */
export function extractArticle(
  html: string,
  pageUrl: string,
  { maxChars = 6_000, minChars = 200 }: ExtractOptions = {},
): ExtractedArticle {
  const { document } = parseHTML(html);

  // Read metadata first: Readability mutates the document.
  const meta = (selector: string) =>
    document.querySelector(selector)?.getAttribute('content') ?? undefined;
  const jsonLd = readJsonLd(document);

  const title = firstNonEmpty(
    meta('meta[property="og:title"]'),
    meta('meta[name="twitter:title"]'),
    jsonLd.headline,
    document.querySelector('h1')?.textContent ?? undefined,
    document.querySelector('title')?.textContent ?? undefined,
  );
  const imageUrl = toWebUrl(
    firstNonEmpty(
      meta('meta[property="og:image"]'),
      meta('meta[name="twitter:image"]'),
      jsonLd.image,
    ),
    pageUrl,
  );
  const publishedAt = toIsoUtc(
    firstNonEmpty(
      meta('meta[property="article:published_time"]'),
      meta('meta[name="date"]'),
      meta('meta[itemprop="datePublished"]'),
      jsonLd.datePublished,
      document.querySelector('time[datetime]')?.getAttribute('datetime') ?? undefined,
    ),
  );

  let text = '';
  try {
    const article = new Readability(document).parse();
    text = collapseWhitespace(article?.textContent ?? '');
  } catch {
    // Unparseable page: fall through with metadata only.
  }

  return {
    text: text.length >= minChars ? truncate(text, maxChars) : '',
    ...(title ? { title } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(publishedAt ? { publishedAt } : {}),
  };
}

interface JsonLdArticle {
  headline?: string;
  datePublished?: string;
  image?: string;
}

/** Reads the first schema.org Article-like object from JSON-LD script tags. */
function readJsonLd(document: {
  querySelectorAll(selector: string): Iterable<{ textContent: string | null }>;
}): JsonLdArticle {
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    let data: unknown;
    try {
      data = JSON.parse(script.textContent ?? '');
    } catch {
      continue;
    }
    const nodes = (Array.isArray(data) ? data : [data, ...graphOf(data)]) as unknown[];
    for (const node of nodes) {
      if (!isRecord(node)) continue;
      const type = node['@type'];
      const types = Array.isArray(type) ? type : [type];
      if (!types.some((t) => typeof t === 'string' && /Article|BlogPosting|Report/.test(t)))
        continue;
      const image = node['image'];
      return {
        ...(typeof node['headline'] === 'string' ? { headline: node['headline'] } : {}),
        ...(typeof node['datePublished'] === 'string'
          ? { datePublished: node['datePublished'] }
          : {}),
        ...(typeof image === 'string'
          ? { image }
          : isRecord(image) && typeof image['url'] === 'string'
            ? { image: image['url'] }
            : Array.isArray(image) && typeof image[0] === 'string'
              ? { image: image[0] }
              : {}),
      };
    }
  }
  return {};
}

function graphOf(data: unknown): unknown[] {
  return isRecord(data) && Array.isArray(data['@graph']) ? (data['@graph'] as unknown[]) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function firstNonEmpty(...values: (string | undefined)[]): string | undefined {
  for (const value of values) {
    const trimmed = value ? collapseWhitespace(value) : '';
    if (trimmed) return trimmed;
  }
  return undefined;
}
