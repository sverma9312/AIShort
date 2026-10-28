/** Resolves `href` against `base` and returns it only if it is an absolute http(s) URL. */
export function toWebUrl(href: unknown, base?: string): string | undefined {
  if (typeof href !== 'string' || href.trim() === '') return undefined;
  try {
    const url = new URL(href.trim(), base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
