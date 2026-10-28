/**
 * Parses a JSON object from model output, tolerating Markdown code fences and text around it.
 * Returns undefined if no JSON object can be found.
 */
export function parseJsonObject(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)?.[1];
  for (const candidate of [text, fenced, sliceObject(text)]) {
    if (!candidate) continue;
    try {
      const value: unknown = JSON.parse(candidate.trim());
      if (value !== null && typeof value === 'object') return value;
    } catch {
      // try the next candidate
    }
  }
  return undefined;
}

function sliceObject(text: string): string | undefined {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start >= 0 && end > start ? text.slice(start, end + 1) : undefined;
}
