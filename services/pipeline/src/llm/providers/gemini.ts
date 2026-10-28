import { z } from 'zod';
import type { FetchFn } from '../../sources/http';
import { LlmError, type CompletionRequest, type LlmProvider } from '../types';
import { postJson } from './postJson';

export interface GeminiOptions {
  apiKey: string;
  model: string;
  requestsPerMinute: number;
  fetch?: FetchFn;
  timeoutMs?: number;
  baseUrl?: string;
}

const GeminiResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z
              .array(z.object({ text: z.string().optional(), thought: z.boolean().optional() }))
              .optional(),
          })
          .optional(),
        finishReason: z.string().optional(),
      }),
    )
    .optional(),
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
});

/** Google Gemini via the Generative Language REST API (JSON output mode). */
export class GeminiProvider implements LlmProvider {
  readonly name = 'gemini';
  readonly minIntervalMs: number;

  constructor(private readonly options: GeminiOptions) {
    this.minIntervalMs = Math.ceil(60_000 / options.requestsPerMinute);
  }

  async complete(request: CompletionRequest): Promise<string> {
    const { apiKey, model, baseUrl = 'https://generativelanguage.googleapis.com' } = this.options;
    const json = await postJson({
      provider: this.name,
      fetch: this.options.fetch ?? ((input, init) => fetch(input, init)),
      url: `${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      headers: { 'x-goog-api-key': apiKey },
      timeoutMs: this.options.timeoutMs ?? 60_000,
      body: {
        systemInstruction: { parts: [{ text: request.system }] },
        contents: [{ role: 'user', parts: [{ text: request.user }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens: request.maxOutputTokens,
          temperature: request.temperature ?? 0.2,
        },
      },
    });

    const parsed = GeminiResponseSchema.safeParse(json);
    if (!parsed.success) throw new LlmError('unexpected response shape', 'bad-response', this.name);
    const candidate = parsed.data.candidates?.[0];
    const text = (candidate?.content?.parts ?? [])
      .filter((part) => !part.thought)
      .map((part) => part.text ?? '')
      .join('');
    if (!text) {
      const reason =
        parsed.data.promptFeedback?.blockReason ?? candidate?.finishReason ?? 'empty reply';
      throw new LlmError(`no text in reply (${reason})`, 'bad-response', this.name);
    }
    return text;
  }
}
