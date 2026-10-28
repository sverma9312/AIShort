import { z } from 'zod';

// GitHub Actions passes unset secrets as empty strings; treat those as missing.
const optional = z.preprocess((v) => (v === '' ? undefined : v), z.string().optional());
const withDefault = (value: string) =>
  z.preprocess((v) => (v === '' ? undefined : v), z.string().default(value));
const rpm = (value: number) =>
  z.preprocess(
    (v) => (v === '' || v === undefined ? value : v),
    z.coerce.number().int().positive(),
  );

const EnvSchema = z.object({
  /** Comma-separated provider order; the first that works wins. */
  LLM_PROVIDERS: withDefault('gemini,groq'),

  GEMINI_API_KEY: optional,
  GEMINI_MODEL: withDefault('gemini-3.5-flash-lite'),
  GEMINI_RPM: rpm(10),

  GROQ_API_KEY: optional,
  GROQ_MODEL: withDefault('openai/gpt-oss-20b'),
  GROQ_RPM: rpm(30),

  ANTHROPIC_API_KEY: optional,
  ANTHROPIC_MODEL: withDefault('claude-haiku-4-5'),
  ANTHROPIC_RPM: rpm(50),

  /** Comma-separated feed base URLs published in meta.json (primary first). */
  FEED_BASE_URLS: withDefault('https://example.github.io/AIShort'),
  /** Shown in our User-Agent so site owners can reach us. */
  CONTACT_URL: withDefault('https://github.com/sverma9312/AIShort'),
});

export type Env = z.infer<typeof EnvSchema>;

/** Validates environment variables. Errors name the variable but never echo its value. */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`Invalid environment:\n  ${problems.join('\n  ')}`);
  }
  return result.data;
}

export function listOf(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Product token matched against robots.txt User-agent lines. */
export const BOT_NAME = 'AIShortBot';

export function userAgent(env: Pick<Env, 'CONTACT_URL'>): string {
  return `Mozilla/5.0 (compatible; ${BOT_NAME}/0.1; +${env.CONTACT_URL})`;
}
