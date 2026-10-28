import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import { collapseWhitespace, truncate } from '../lib/text';
import { toIsoUtc } from '../lib/time';
import { toWebUrl } from '../lib/url';

export interface ExtractedArticle {
  /** Main article text, one paragraph per line pair ("\n\n"), truncated; empty if none found. */
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

  // Readability keeps boilerplate that sits next to short articles, so remove it first.
  for (const element of document.querySelectorAll(BOILERPLATE_SELECTOR)) element.remove();
  for (const element of document.querySelectorAll('[class], [id]')) {
    const label = `${element.getAttribute('class') ?? ''} ${element.getAttribute('id') ?? ''}`;
    if (BOILERPLATE_LABEL.test(label) && element.tagName !== 'BODY' && element.tagName !== 'HTML')
      element.remove();
  }

  let text = '';
  try {
    const article = new Readability(document).parse();
    text = article?.content ? paragraphsOf(article.content) : '';
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

const BOILERPLATE_SELECTOR =
  'script, style, noscript, iframe, form, nav, header, footer, aside, [role="navigation"], [role="banner"], [role="contentinfo"], [aria-modal="true"]';
const BOILERPLATE_LABEL =
  /\b(cookie|consent|gdpr|newsletter|subscribe|signup|paywall|modal|popup|banner|share|social|related|comments?|advert|promo)\w*/i;
/** "Jane Doe is a senior reporter covering…" — author boxes often have no semantic markup. */
const AUTHOR_BIO =
  /^[\p{Lu}][\p{L}.'’-]+(?: [\p{Lu}][\p{L}.'’-]+){0,3} is an? (?:[\p{L}-]+ ){0,4}(?:writer|reporter|editor|journalist|correspondent|columnist|contributor|analyst)\b/u;
const BLOCKS = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, figcaption, td';

/** Converts Readability's article HTML to text with one blank line between blocks. */
function paragraphsOf(html: string): string {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  const blocks = [...document.querySelectorAll(BLOCKS)]
    // Skip containers whose text is already covered by a nested block (e.g. <li><p>…</p></li>).
    .filter((el) => !el.querySelector(BLOCKS))
    .map((el) => collapseWhitespace(el.textContent ?? ''))
    .filter((block) => block && !AUTHOR_BIO.test(block));
  return blocks.length ? blocks.join('\n\n') : collapseWhitespace(document.body.textContent ?? '');
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
