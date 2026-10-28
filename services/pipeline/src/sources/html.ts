import { parseHTML } from 'linkedom';
import { collapseWhitespace } from '../lib/text';

export interface ListingOptions {
  linkPattern: string;
  exclude: readonly string[];
  maxItems: number;
}

export interface ListingItem {
  url: string;
  title: string;
}

/**
 * Extracts article links from a news listing page (for labs without an RSS feed).
 * Keeps same-host links whose pathname matches `linkPattern`, in page order, without duplicates.
 * Link text is only a provisional title — the article's own title replaces it after extraction.
 */
export function parseListing(
  html: string,
  pageUrl: string,
  options: ListingOptions,
): ListingItem[] {
  const page = new URL(pageUrl);
  const pattern = new RegExp(options.linkPattern);
  const exclude = new Set(options.exclude.map(stripTrailingSlash));
  const { document } = parseHTML(html);

  const items: ListingItem[] = [];
  const seen = new Set<string>();
  for (const anchor of document.querySelectorAll('a[href]')) {
    let url: URL;
    try {
      url = new URL(anchor.getAttribute('href') ?? '', page);
    } catch {
      continue;
    }
    url.hash = '';
    url.search = '';
    const path = stripTrailingSlash(url.pathname);
    if (url.host !== page.host || !pattern.test(url.pathname) || exclude.has(path)) continue;
    if (path === stripTrailingSlash(page.pathname) || seen.has(url.toString())) continue;

    seen.add(url.toString());
    const title =
      collapseWhitespace(anchor.textContent ?? '') ||
      collapseWhitespace(anchor.getAttribute('aria-label') ?? '') ||
      slugToTitle(path);
    items.push({ url: url.toString(), title });
    if (items.length >= options.maxItems) break;
  }
  return items;
}

function stripTrailingSlash(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

function slugToTitle(path: string): string {
  const slug = path.split('/').filter(Boolean).pop() ?? '';
  const words = slug.replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
