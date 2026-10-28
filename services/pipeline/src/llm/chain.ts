import type { z } from 'zod';
import { parseJsonObject } from './json';
import {
  AllProvidersFailedError,
  LlmError,
  type CompletionRequest,
  type LlmErrorKind,
  type LlmProvider,
} from './types';

/** Disable a provider for the rest of the run after this many consecutive transient failures. */
const MAX_CONSECUTIVE_FAILURES = 3;

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export interface ProviderStats {
  calls: number;
  failures: number;
  disabled?: LlmErrorKind;
}

/** Anything that can return schema-validated JSON from an LLM. */
export interface JsonLlm {
  completeJson<T>(
    request: CompletionRequest,
    schema: z.ZodType<T>,
  ): Promise<{ data: T; provider: string }>;
}

/**
 * Tries providers in order until one returns valid JSON matching the schema.
 * - Throttles each provider to its requests-per-minute limit.
 * - Rate-limit (quota) and auth errors disable that provider for the rest of the run.
 * - Transient errors fall through to the next provider; repeated ones disable it.
 */
export class ProviderChain implements JsonLlm {
  private readonly state = new Map<
    string,
    ProviderStats & { nextAt: number; consecutive: number }
  >();

  constructor(
    private readonly providers: readonly LlmProvider[],
    private readonly clock: Clock = systemClock,
  ) {
    for (const provider of providers) {
      this.state.set(provider.name, { calls: 0, failures: 0, nextAt: 0, consecutive: 0 });
    }
  }

  get providerNames(): string[] {
    return this.providers.map((p) => p.name);
  }

  stats(): Record<string, ProviderStats> {
    return Object.fromEntries(
      [...this.state].map(([name, { calls, failures, disabled }]) => [
        name,
        { calls, failures, ...(disabled ? { disabled } : {}) },
      ]),
    );
  }

  async completeJson<T>(
    request: CompletionRequest,
    schema: z.ZodType<T>,
  ): Promise<{ data: T; provider: string }> {
    const failures: AllProvidersFailedError['failures'] = [];

    for (const provider of this.providers) {
      const state = this.state.get(provider.name)!;
      if (state.disabled) {
        failures.push({
          provider: provider.name,
          kind: 'disabled',
          message: `disabled after ${state.disabled}`,
        });
        continue;
      }

      const wait = state.nextAt - this.clock.now();
      if (wait > 0) await this.clock.sleep(wait);
      state.nextAt = this.clock.now() + provider.minIntervalMs;
      state.calls++;

      try {
        const text = await provider.complete(request);
        const parsed = schema.safeParse(parseJsonObject(text));
        if (!parsed.success) {
          throw new LlmError(
            `reply did not match the expected JSON shape: ${parsed.error.issues[0]?.message ?? ''}`,
            'bad-response',
            provider.name,
          );
        }
        state.consecutive = 0;
        return { data: parsed.data, provider: provider.name };
      } catch (error) {
        const llmError =
          error instanceof LlmError
            ? error
            : new LlmError(
                String(error instanceof Error ? error.message : error),
                'network',
                provider.name,
              );
        state.failures++;
        state.consecutive++;
        if (
          llmError.kind === 'rate-limit' ||
          llmError.kind === 'auth' ||
          state.consecutive >= MAX_CONSECUTIVE_FAILURES
        ) {
          state.disabled = llmError.kind;
        }
        failures.push({ provider: provider.name, kind: llmError.kind, message: llmError.message });
      }
    }
    throw new AllProvidersFailedError(failures);
  }
}
