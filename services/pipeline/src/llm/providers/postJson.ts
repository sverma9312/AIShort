import type { FetchFn } from '../../sources/http';
import { LlmError, type LlmErrorKind } from '../types';

export interface PostJsonOptions {
  provider: string;
  fetch: FetchFn;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  timeoutMs: number;
}

/**
 * POSTs JSON to an LLM API and returns the parsed response, mapping failures to LlmError kinds.
 * Error messages include the status and a short excerpt of the response body, never the request
 * (which contains the API key in its headers).
 */
export async function postJson({
  provider,
  fetch,
  url,
  headers,
  body,
  timeoutMs,
}: PostJsonOptions): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timedOut =
      error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    throw new LlmError(
      timedOut
        ? `request timed out after ${timeoutMs} ms`
        : `network error: ${String(error instanceof Error ? error.message : error)}`,
      timedOut ? 'timeout' : 'network',
      provider,
      undefined,
      { cause: error },
    );
  }

  const text = await response.text();
  if (!response.ok) {
    throw new LlmError(
      `HTTP ${response.status}: ${text.slice(0, 200)}`,
      kindForStatus(response.status),
      provider,
      response.status,
    );
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new LlmError('response is not JSON', 'bad-response', provider, response.status, {
      cause: error,
    });
  }
}

function kindForStatus(status: number): LlmErrorKind {
  if (status === 429) return 'rate-limit';
  if (status === 401 || status === 403) return 'auth';
  if (status === 408) return 'timeout';
  if (status >= 500) return 'server'; // includes Anthropic's 529 "overloaded"
  return 'bad-request';
}
