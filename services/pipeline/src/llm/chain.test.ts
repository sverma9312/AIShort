import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ProviderChain, type Clock } from './chain';
import { ScriptedProvider } from './scriptedProvider';
import { AllProvidersFailedError } from './types';

const schema = z.object({ answer: z.number() });
const request = { system: 's', user: 'u', maxOutputTokens: 50 };

function fakeClock(): Clock & { slept: number[] } {
  let now = 0;
  const slept: number[] = [];
  return {
    slept,
    now: () => now,
    sleep: (ms) => {
      slept.push(ms);
      now += ms;
      return Promise.resolve();
    },
  };
}

describe('ProviderChain', () => {
  it('returns validated JSON from the first provider', async () => {
    const chain = new ProviderChain([new ScriptedProvider('a', ['{"answer": 42}'])], fakeClock());
    await expect(chain.completeJson(request, schema)).resolves.toEqual({
      data: { answer: 42 },
      provider: 'a',
    });
  });

  it('fails over on rate limits and disables the limited provider for the run', async () => {
    const a = new ScriptedProvider('a', [{ error: 'rate-limit' }]);
    const b = new ScriptedProvider('b', ['{"answer": 1}']);
    const chain = new ProviderChain([a, b], fakeClock());

    await expect(chain.completeJson(request, schema)).resolves.toMatchObject({ provider: 'b' });
    await expect(chain.completeJson(request, schema)).resolves.toMatchObject({ provider: 'b' });
    expect(a.requests).toHaveLength(1);
    expect(chain.stats()).toEqual({
      a: { calls: 1, failures: 1, disabled: 'rate-limit' },
      b: { calls: 2, failures: 0 },
    });
  });

  it('disables providers with invalid keys', async () => {
    const a = new ScriptedProvider('a', [{ error: 'auth' }]);
    const chain = new ProviderChain([a, new ScriptedProvider('b', ['{"answer": 1}'])], fakeClock());
    await chain.completeJson(request, schema);
    expect(chain.stats()['a']?.disabled).toBe('auth');
  });

  it('falls through on schema-invalid replies without disabling the provider', async () => {
    const a = new ScriptedProvider('a', ['{"wrong": true}', '{"answer": 7}']);
    const b = new ScriptedProvider('b', ['{"answer": 1}']);
    const chain = new ProviderChain([a, b], fakeClock());

    await expect(chain.completeJson(request, schema)).resolves.toMatchObject({ provider: 'b' });
    await expect(chain.completeJson(request, schema)).resolves.toEqual({
      data: { answer: 7 },
      provider: 'a',
    });
  });

  it('disables a provider after 3 consecutive transient failures', async () => {
    const a = new ScriptedProvider('a', [{ error: 'server' }]);
    const chain = new ProviderChain([a, new ScriptedProvider('b', ['{"answer": 1}'])], fakeClock());
    for (let i = 0; i < 4; i++) await chain.completeJson(request, schema);
    expect(a.requests).toHaveLength(3);
    expect(chain.stats()['a']?.disabled).toBe('server');
  });

  it('throws AllProvidersFailedError listing every failure', async () => {
    const chain = new ProviderChain(
      [
        new ScriptedProvider('a', [{ error: 'rate-limit' }]),
        new ScriptedProvider('b', [{ error: 'timeout' }]),
      ],
      fakeClock(),
    );
    const error = await chain.completeJson(request, schema).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AllProvidersFailedError);
    expect((error as AllProvidersFailedError).failures.map((f) => [f.provider, f.kind])).toEqual([
      ['a', 'rate-limit'],
      ['b', 'timeout'],
    ]);
  });

  it('throws when no providers are configured', async () => {
    await expect(new ProviderChain([], fakeClock()).completeJson(request, schema)).rejects.toThrow(
      /none configured/,
    );
  });

  it('spaces requests to respect each provider rate limit', async () => {
    const clock = fakeClock();
    const chain = new ProviderChain([new ScriptedProvider('a', ['{"answer": 1}'], 6000)], clock);
    await chain.completeJson(request, schema);
    await chain.completeJson(request, schema);
    await chain.completeJson(request, schema);
    expect(clock.slept).toEqual([6000, 6000]);
  });
});
