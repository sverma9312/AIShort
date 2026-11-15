import { FEED_PATHS, feedUrl } from '@aishort/shared';

const DEFAULT_FEED_BASE_URL = 'https://aishort.nextai-apps.com';
const FALLBACK_FEED_BASE_URL = 'https://sverma9312.github.io/AIShort';
const DEFAULT_SUPPORT_EMAIL = 'contact@nextai-apps.com';
const DEFAULT_SUPABASE_URL = 'https://njfugubxpmpmhhcxmwmg.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5qZnVndWJ4cG1wbWhoY3htd21nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM1MTY0MTYsImV4cCI6MjEwOTA5MjQxNn0.E3ObRtMC-yUc4gMxFiaxHwl6Y7aUYBbB3crC6JDCF60';

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function optional(value: string | undefined): string | undefined {
  return value && value.trim() ? value.trim() : undefined;
}

// EXPO_PUBLIC_* variables are inlined at build time, so each must be read with a literal name.
const feedBaseUrls = list(process.env.EXPO_PUBLIC_FEED_BASE_URLS);
const primary = feedBaseUrls[0] ?? DEFAULT_FEED_BASE_URL;

export const config = {
  /** Built-in feed locations, primary first. meta.json can add more at runtime. */
  feedBaseUrls: feedBaseUrls.length
    ? feedBaseUrls
    : [DEFAULT_FEED_BASE_URL, FALLBACK_FEED_BASE_URL],
  privacyUrl: feedUrl(primary, 'privacy/'),
  supportUrl: feedUrl(primary, 'support/'),
  supportEmail: optional(process.env.EXPO_PUBLIC_SUPPORT_EMAIL) ?? DEFAULT_SUPPORT_EMAIL,
  metaPath: FEED_PATHS.meta,
  supabaseUrl: optional(process.env.EXPO_PUBLIC_SUPABASE_URL) ?? DEFAULT_SUPABASE_URL,
  supabaseAnonKey: optional(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) ?? DEFAULT_SUPABASE_ANON_KEY,
  sentryDsn: optional(process.env.EXPO_PUBLIC_SENTRY_DSN),
  posthogKey: optional(process.env.EXPO_PUBLIC_POSTHOG_KEY),
  posthogHost: optional(process.env.EXPO_PUBLIC_POSTHOG_HOST) ?? 'https://us.i.posthog.com',
} as const;
