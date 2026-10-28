import { describe, expect, it } from 'vitest';
import { loadEnv } from '../config/env';
import { createProviders } from './factory';

describe('createProviders', () => {
  it('builds providers in the configured order and skips those without keys', () => {
    const { providers, skipped } = createProviders(
      loadEnv({
        LLM_PROVIDERS: 'groq,gemini,anthropic',
        GROQ_API_KEY: 'g',
        ANTHROPIC_API_KEY: 'a',
      }),
    );
    expect(providers.map((p) => p.name)).toEqual(['groq', 'anthropic']);
    expect(skipped).toEqual(['gemini']);
  });

  it('rejects unknown provider names', () => {
    expect(() => createProviders(loadEnv({ LLM_PROVIDERS: 'gemini,openrouter' }))).toThrow(
      /Unknown LLM provider "openrouter"/,
    );
  });
});
