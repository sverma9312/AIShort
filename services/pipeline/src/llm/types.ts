export interface CompletionRequest {
  system: string;
  user: string;
  maxOutputTokens: number;
  temperature?: number;
}

/** A single LLM API. Returns the raw text of the reply; JSON parsing happens in the chain. */
export interface LlmProvider {
  readonly name: string;
  /** Minimum time between requests, derived from the provider's requests-per-minute limit. */
  readonly minIntervalMs: number;
  complete(request: CompletionRequest): Promise<string>;
}

export type LlmErrorKind =
  | 'rate-limit' // 429 / quota exhausted
  | 'auth' // 401 / 403
  | 'bad-request' // 4xx: prompt too long, unknown model, …
  | 'server' // 5xx / overloaded
  | 'timeout'
  | 'network'
  | 'bad-response'; // unparseable or schema-invalid reply, blocked content

export class LlmError extends Error {
  constructor(
    message: string,
    readonly kind: LlmErrorKind,
    readonly provider: string,
    readonly status?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'LlmError';
  }
}

/** Every configured provider failed; the caller should retry the work on a later run. */
export class AllProvidersFailedError extends Error {
  constructor(
    readonly failures: { provider: string; kind: LlmErrorKind | 'disabled'; message: string }[],
  ) {
    super(
      `All LLM providers failed: ${failures.map((f) => `${f.provider} (${f.kind})`).join(', ') || 'none configured'}`,
    );
    this.name = 'AllProvidersFailedError';
  }
}
