import { parseHTML } from 'linkedom';

/** Collapses all whitespace runs to single spaces and trims. */
export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/gu, ' ').trim();
}

/** Converts an HTML fragment (e.g. an RSS description) to plain text. */
export function htmlToText(html: string): string {
  if (!/[<&]/.test(html)) return collapseWhitespace(html);
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  return collapseWhitespace(document.body.textContent ?? '');
}

/** Truncates to at most `maxChars`, cutting at a word boundary and adding "…" when shortened. */
export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
