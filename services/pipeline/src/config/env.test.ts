import { describe, expect, it } from 'vitest';
import { listOf, loadEnv, userAgent } from './env';

describe('loadEnv', () => {
  it('applies defaults', () => {
    const env = loadEnv({});
    expect(env).toMatchObject({ LLM_PROVIDERS: 'gemini,groq', GEMINI_RPM: 10, GROQ_RPM: 30 });
    expect(env.GEMINI_API_KEY).toBeUndefined();
  });

  it('treats empty strings (unset GitHub secrets) as missing', () => {
    const env = loadEnv({ GEMINI_API_KEY: '', GEMINI_MODEL: '', GEMINI_RPM: '' });
    expect(env.GEMINI_API_KEY).toBeUndefined();
    expect(env.GEMINI_MODEL).toBe('gemini-3.5-flash-lite');
    expect(env.GEMINI_RPM).toBe(10);
  });

  it('coerces numbers and reports invalid values without echoing them', () => {
    expect(loadEnv({ GROQ_RPM: '60' }).GROQ_RPM).toBe(60);
    expect(() => loadEnv({ GROQ_RPM: 'secret-looking-value' })).toThrow(/GROQ_RPM/);
    expect(() => loadEnv({ GROQ_RPM: 'secret-looking-value' })).not.toThrow(/secret-looking-value/);
  });
});

describe('helpers', () => {
  it('splits comma lists', () => {
    expect(listOf(' gemini, groq ,,anthropic ')).toEqual(['gemini', 'groq', 'anthropic']);
  });

  it('builds a contactable user agent', () => {
    expect(userAgent({ CONTACT_URL: 'https://github.com/x/y' })).toBe(
      'Mozilla/5.0 (compatible; AIShortBot/0.1; +https://github.com/x/y)',
    );
  });
});
