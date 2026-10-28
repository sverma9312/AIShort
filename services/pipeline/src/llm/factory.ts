import { listOf, type Env } from '../config/env';
import type { FetchFn } from '../sources/http';
import { AnthropicProvider } from './providers/anthropic';
import { GeminiProvider } from './providers/gemini';
import { OpenAiCompatibleProvider } from './providers/openaiCompatible';
import type { LlmProvider } from './types';

export const KNOWN_PROVIDERS = ['gemini', 'groq', 'anthropic'] as const;

/**
 * Builds providers in LLM_PROVIDERS order. Providers without an API key are skipped (and
 * reported) so a missing optional key never breaks a run; unknown names are a config error.
 */
export function createProviders(
  env: Env,
  fetch?: FetchFn,
): { providers: LlmProvider[]; skipped: string[] } {
  const providers: LlmProvider[] = [];
  const skipped: string[] = [];
  const shared = fetch ? { fetch } : {};

  for (const name of listOf(env.LLM_PROVIDERS)) {
    switch (name) {
      case 'gemini':
        if (!env.GEMINI_API_KEY) skipped.push(name);
        else
          providers.push(
            new GeminiProvider({
              apiKey: env.GEMINI_API_KEY,
              model: env.GEMINI_MODEL,
              requestsPerMinute: env.GEMINI_RPM,
              ...shared,
            }),
          );
        break;
      case 'groq':
        if (!env.GROQ_API_KEY) skipped.push(name);
        else
          providers.push(
            new OpenAiCompatibleProvider({
              name: 'groq',
              baseUrl: 'https://api.groq.com/openai/v1',
              apiKey: env.GROQ_API_KEY,
              model: env.GROQ_MODEL,
              requestsPerMinute: env.GROQ_RPM,
              // Reasoning models spend output tokens thinking; keep it short for this task.
              ...(env.GROQ_MODEL.includes('gpt-oss')
                ? { extraBody: { reasoning_effort: 'low' } }
                : {}),
              ...shared,
            }),
          );
        break;
      case 'anthropic':
        if (!env.ANTHROPIC_API_KEY) skipped.push(name);
        else
          providers.push(
            new AnthropicProvider({
              apiKey: env.ANTHROPIC_API_KEY,
              model: env.ANTHROPIC_MODEL,
              requestsPerMinute: env.ANTHROPIC_RPM,
              ...shared,
            }),
          );
        break;
      default:
        throw new Error(
          `Unknown LLM provider "${name}" in LLM_PROVIDERS (known: ${KNOWN_PROVIDERS.join(', ')})`,
        );
    }
  }
  return { providers, skipped };
}
