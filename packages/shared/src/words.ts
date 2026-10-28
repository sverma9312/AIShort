/**
 * Counts words the way a reader would: whitespace-separated tokens that contain at least one
 * letter or digit. Hyphenated terms ("GPT-5", "open-source") count as one word, and standalone
 * punctuation ("—", "-", "…") is not counted.
 */
export function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/u)
    .filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}
