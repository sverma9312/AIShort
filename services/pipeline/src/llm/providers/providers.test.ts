import { describe, expect, it } from 'vitest';
import { LlmError } from '../types';
import { AnthropicProvider } from './anthropic';
import { GeminiProvider } from './gemini';
import { OpenAiCompatibleProvider } from './openaiCompatible';

interface Recorded {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function fakeFetch(status: number, body: unknown) {
  const calls: Recorded[] = [];
  const fetch = (url: string, init?: RequestInit) => {
    calls.push({
      url,
      headers: init?.headers as Record<string, string>,
      body: JSON.parse(init?.body as string) as Record<string, unknown>,
    });
    return Promise.resolve(
      new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
    );
  };
  return { fetch, calls };
}

const request = { system: 'SYS', user: 'USER', maxOutputTokens: 300 };
const SECRET = 'sk-test-secret';

describe('GeminiProvider', () => {
  const make = (status: number, body: unknown) => {
    const f = fakeFetch(status, body);
    return {
      provider: new GeminiProvider({
        apiKey: SECRET,
        model: 'gemini-x',
        requestsPerMinute: 10,
        fetch: f.fetch,
      }),
      ...f,
    };
  };

  it('sends the key in a header (not the URL) and asks for JSON output', async () => {
    const { provider, calls } = make(200, {
      candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
    });
    await expect(provider.complete(request)).resolves.toBe('{"ok":true}');
    const [call] = calls;
    expect(call?.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent',
    );
    expect(call?.url).not.toContain(SECRET);
    expect(call?.headers['x-goog-api-key']).toBe(SECRET);
    expect(call?.body).toMatchObject({
      systemInstruction: { parts: [{ text: 'SYS' }] },
      contents: [{ role: 'user', parts: [{ text: 'USER' }] }],
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 300 },
    });
    expect(provider.minIntervalMs).toBe(6000);
  });

  it('skips thought parts', async () => {
    const { provider } = make(200, {
      candidates: [
        { content: { parts: [{ text: 'thinking…', thought: true }, { text: '{"a":1}' }] } },
      ],
    });
    await expect(provider.complete(request)).resolves.toBe('{"a":1}');
  });

  it('reports blocked prompts as bad responses', async () => {
    const { provider } = make(200, { promptFeedback: { blockReason: 'SAFETY' } });
    await expect(provider.complete(request)).rejects.toMatchObject({
      kind: 'bad-response',
      message: expect.stringContaining('SAFETY') as string,
    });
  });
});

describe('OpenAiCompatibleProvider (Groq)', () => {
  it('sends a chat completion request in JSON mode with extra body fields', async () => {
    const { fetch, calls } = fakeFetch(200, { choices: [{ message: { content: '{"a":1}' } }] });
    const provider = new OpenAiCompatibleProvider({
      name: 'groq',
      baseUrl: 'https://api.groq.com/openai/v1/',
      apiKey: SECRET,
      model: 'openai/gpt-oss-20b',
      requestsPerMinute: 30,
      extraBody: { reasoning_effort: 'low' },
      fetch,
    });
    await expect(provider.complete(request)).resolves.toBe('{"a":1}');
    expect(calls[0]?.url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(calls[0]?.headers['Authorization']).toBe(`Bearer ${SECRET}`);
    expect(calls[0]?.body).toMatchObject({
      model: 'openai/gpt-oss-20b',
      messages: [
        { role: 'system', content: 'SYS' },
        { role: 'user', content: 'USER' },
      ],
      max_completion_tokens: 300,
      response_format: { type: 'json_object' },
      reasoning_effort: 'low',
    });
  });

  it('rejects an empty reply', async () => {
    const { fetch } = fakeFetch(200, { choices: [{ message: { content: null } }] });
    const provider = new OpenAiCompatibleProvider({
      name: 'groq',
      baseUrl: 'https://x',
      apiKey: 'k',
      model: 'm',
      requestsPerMinute: 30,
      fetch,
    });
    await expect(provider.complete(request)).rejects.toMatchObject({ kind: 'bad-response' });
  });
});

describe('AnthropicProvider', () => {
  it('calls the Messages API and joins text blocks', async () => {
    const { fetch, calls } = fakeFetch(200, {
      content: [
        { type: 'text', text: '{"a":' },
        { type: 'text', text: '1}' },
      ],
    });
    const provider = new AnthropicProvider({
      apiKey: SECRET,
      model: 'claude-haiku-4-5',
      requestsPerMinute: 50,
      fetch,
    });
    await expect(provider.complete(request)).resolves.toBe('{"a":1}');
    expect(calls[0]?.url).toBe('https://api.anthropic.com/v1/messages');
    expect(calls[0]?.headers).toMatchObject({
      'x-api-key': SECRET,
      'anthropic-version': '2023-06-01',
    });
    expect(calls[0]?.body).toMatchObject({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      system: 'SYS',
      messages: [{ role: 'user', content: 'USER' }],
    });
  });
});

describe('HTTP error mapping', () => {
  it.each([
    [429, 'rate-limit'],
    [401, 'auth'],
    [403, 'auth'],
    [400, 'bad-request'],
    [404, 'bad-request'],
    [500, 'server'],
    [503, 'server'],
    [529, 'server'],
  ])('HTTP %i → %s', async (status, kind) => {
    const { fetch } = fakeFetch(status, { error: { message: 'nope' } });
    const provider = new GeminiProvider({
      apiKey: SECRET,
      model: 'm',
      requestsPerMinute: 10,
      fetch,
    });
    const error = await provider.complete(request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LlmError);
    expect(error).toMatchObject({ kind, status, provider: 'gemini' });
    expect(String((error as Error).message)).not.toContain(SECRET);
  });

  it('maps timeouts and network failures', async () => {
    const timeout = () =>
      Promise.reject(Object.assign(new Error('aborted'), { name: 'TimeoutError' }));
    const offline = () => Promise.reject(new TypeError('fetch failed'));
    const make = (fetch: () => Promise<Response>) =>
      new GeminiProvider({ apiKey: 'k', model: 'm', requestsPerMinute: 10, fetch });
    await expect(make(timeout).complete(request)).rejects.toMatchObject({ kind: 'timeout' });
    await expect(make(offline).complete(request)).rejects.toMatchObject({ kind: 'network' });
  });

  it('maps non-JSON success bodies to bad-response', async () => {
    const { fetch } = fakeFetch(200, '<html>gateway</html>');
    const provider = new GeminiProvider({ apiKey: 'k', model: 'm', requestsPerMinute: 10, fetch });
    await expect(provider.complete(request)).rejects.toMatchObject({ kind: 'bad-response' });
  });
});
