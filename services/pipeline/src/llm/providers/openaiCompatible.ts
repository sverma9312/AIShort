import { z } from 'zod';
import type { FetchFn } from '../../sources/http';
import { LlmError, type CompletionRequest, type LlmProvider } from '../types';
import { postJson } from './postJson';

export interface OpenAiCompatibleOptions {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  requestsPerMinute: number;
  /** Extra request fields for this provider/model, e.g. `{ reasoning_effort: 'low' }`. */
  extraBody?: Record<string, unknown>;
  fetch?: FetchFn;
  timeoutMs?: number;
}

const ChatResponseSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullish() }) })).min(1),
});

/** Any OpenAI-compatible chat completions API (used for Groq). */
export class OpenAiCompatibleProvider implements LlmProvider {
  readonly name: string;
  readonly minIntervalMs: number;

  constructor(private readonly options: OpenAiCompatibleOptions) {
    this.name = options.name;
    this.minIntervalMs = Math.ceil(60_000 / options.requestsPerMinute);
  }

  async complete(request: CompletionRequest): Promise<string> {
    const json = await postJson({
      provider: this.name,
      fetch: this.options.fetch ?? ((input, init) => fetch(input, init)),
      url: `${this.options.baseUrl.replace(/\/+$/, '')}/chat/completions`,
      headers: { Authorization: `Bearer ${this.options.apiKey}` },
      timeoutMs: this.options.timeoutMs ?? 60_000,
      body: {
        model: this.options.model,
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.user },
        ],
        max_completion_tokens: request.maxOutputTokens,
        temperature: request.temperature ?? 0.2,
        response_format: { type: 'json_object' },
        ...this.options.extraBody,
      },
    });

    const parsed = ChatResponseSchema.safeParse(json);
    const text = parsed.success ? parsed.data.choices[0]?.message.content : undefined;
    if (!text) throw new LlmError('no text in reply', 'bad-response', this.name);
    return text;
  }
}
