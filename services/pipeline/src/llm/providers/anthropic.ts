import { z } from 'zod';
import type { FetchFn } from '../../sources/http';
import { LlmError, type CompletionRequest, type LlmProvider } from '../types';
import { postJson } from './postJson';

export interface AnthropicOptions {
  apiKey: string;
  model: string;
  requestsPerMinute: number;
  fetch?: FetchFn;
  timeoutMs?: number;
  baseUrl?: string;
}

const MessagesResponseSchema = z.object({
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
});

/** Anthropic Messages API (optional paid fallback). */
export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic';
  readonly minIntervalMs: number;

  constructor(private readonly options: AnthropicOptions) {
    this.minIntervalMs = Math.ceil(60_000 / options.requestsPerMinute);
  }

  async complete(request: CompletionRequest): Promise<string> {
    const json = await postJson({
      provider: this.name,
      fetch: this.options.fetch ?? ((input, init) => fetch(input, init)),
      url: `${this.options.baseUrl ?? 'https://api.anthropic.com'}/v1/messages`,
      headers: { 'x-api-key': this.options.apiKey, 'anthropic-version': '2023-06-01' },
      timeoutMs: this.options.timeoutMs ?? 60_000,
      body: {
        model: this.options.model,
        max_tokens: request.maxOutputTokens,
        temperature: request.temperature ?? 0.2,
        system: request.system,
        messages: [{ role: 'user', content: request.user }],
      },
    });

    const parsed = MessagesResponseSchema.safeParse(json);
    const text = parsed.success
      ? parsed.data.content
          .filter((block) => block.type === 'text')
          .map((block) => block.text ?? '')
          .join('')
      : '';
    if (!text) throw new LlmError('no text in reply', 'bad-response', this.name);
    return text;
  }
}
