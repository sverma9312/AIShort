import { FEED_PATHS, feedUrl } from '@aishort/shared';

const DEFAULT_FEED_BASE_URL = 'https://sverma9312.github.io/AIShort';

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
  feedBaseUrls: feedBaseUrls.length ? feedBaseUrls : [DEFAULT_FEED_BASE_URL],
  privacyUrl: feedUrl(primary, 'privacy/'),
  supportUrl: feedUrl(primary, 'support/'),
  metaPath: FEED_PATHS.meta,
  supabaseUrl: optional(process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: optional(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
  sentryDsn: optional(process.env.EXPO_PUBLIC_SENTRY_DSN),
  posthogKey: optional(process.env.EXPO_PUBLIC_POSTHOG_KEY),
  posthogHost: optional(process.env.EXPO_PUBLIC_POSTHOG_HOST) ?? 'https://us.i.posthog.com',
} as const;
