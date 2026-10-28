/**
 * Title similarity compatible with Postgres pg_trgm (so Supabase can do the same in SQL):
 * Jaccard similarity of word trigrams, where each lowercased word is padded as "  word ".
 *
 * Plus one guard pg_trgm lacks: titles whose numbers differ ("GPT-6" vs "GPT-7",
 * "$40 million" vs "$400 million") are never considered the same story.
 */
export function titleSimilarity(a: string, b: string): number {
  if (!numbersCompatible(a, b)) return 0;
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / (ta.size + tb.size - shared);
}

export function trigrams(text: string): Set<string> {
  const result = new Set<string>();
  for (const word of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (!word) continue;
    const padded = `  ${word} `;
    for (let i = 0; i + 3 <= padded.length; i++) result.add(padded.slice(i, i + 3));
  }
  return result;
}

function numbersCompatible(a: string, b: string): boolean {
  const na = numbers(a);
  const nb = numbers(b);
  if (na.size === 0 || nb.size === 0) return true;
  return na.size === nb.size && [...na].every((n) => nb.has(n));
}

function numbers(text: string): Set<string> {
  return new Set(text.match(/\d+(?:\.\d+)?/g) ?? []);
}

/**
 * Greedy single-link grouping: each item joins the most similar existing group (compared with
 * every member) if the similarity reaches `threshold`, otherwise starts a new group.
 * Input order is preserved, so sorting by source weight first makes the heaviest source the
 * first member (the primary) of each group.
 */
export function groupBySimilarity<T>(
  items: readonly T[],
  titleOf: (item: T) => string,
  threshold: number,
): T[][] {
  const groups: T[][] = [];
  for (const item of items) {
    let best: { group: T[]; score: number } | undefined;
    for (const group of groups) {
      const score = Math.max(
        ...group.map((member) => titleSimilarity(titleOf(item), titleOf(member))),
      );
      if (score >= threshold && (!best || score > best.score)) best = { group, score };
    }
    if (best) best.group.push(item);
    else groups.push([item]);
  }
  return groups;
}
