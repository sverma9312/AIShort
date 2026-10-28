import { createHash } from 'node:crypto';

/** Query parameters that only track the click and never change the page. */
const TRACKING_PARAM =
  /^(utm_\w+|fbclid|gclid|dclid|gbraid|wbraid|msclkid|yclid|mc_cid|mc_eid|igshid|_hsenc|_hsmi|mkt_tok|ref|ref_src|ref_url|referrer|source|src|cmpid|ocid|ncid|smid|taid|guccounter|guce_\w+|sr_share|spm|share|output_type|outputtype|amp)$/i;

/**
 * Normalizes an article URL so the same article always gets the same identity:
 * lowercases the host, removes tracking parameters, fragments, AMP variants and trailing
 * slashes, and sorts the remaining query parameters. The scheme is kept so links still work.
 * Throws for anything that isn't an absolute http(s) URL.
 */
export function canonicalUrl(input: string): string {
  const url = new URL(input.trim());
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Not an http(s) URL: ${input}`);
  }

  // Google AMP cache: https://www.google.com/amp/s/example.com/story → https://example.com/story
  const ampCache = /^\/amp\/(s\/)?(.+)$/.exec(url.pathname);
  if (/^(www\.)?google\.[a-z.]+$/.test(url.hostname) && ampCache?.[2]) {
    return canonicalUrl(`${ampCache[1] ? 'https' : 'http'}://${ampCache[2]}`);
  }

  url.hash = '';
  url.username = '';
  url.password = '';
  if (url.hostname.startsWith('amp.')) url.hostname = url.hostname.slice(4);

  let path = url.pathname
    .replace(/\/amp\/?$/i, '/')
    .replace(/\.amp(\.html?)?$/i, '$1')
    .replace(/\/{2,}/g, '/');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  url.pathname = path;

  const kept = [...url.searchParams].filter(([key]) => !TRACKING_PARAM.test(key));
  kept.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  url.search = new URLSearchParams(kept).toString();

  return url.toString();
}

/**
 * Stable identity for deduplication: ignores the scheme and a leading "www." so
 * http/https and www/non-www variants of the same article collide.
 */
export function urlHash(canonical: string): string {
  const url = new URL(canonical);
  const key = `${url.hostname.replace(/^www\./, '')}${url.pathname}${url.search}`;
  return createHash('sha256').update(key).digest('hex');
}
