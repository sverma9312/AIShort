import * as Sentry from '@sentry/react-native';
import PostHog from 'posthog-react-native';
import { config } from './config';

/**
 * Crash reporting (Sentry) and anonymous product analytics (PostHog). Both are off unless their
 * keys are configured, and both respect the in-app "Analytics & crash reports" switch.
 * Only the events below are sent — never card text, URLs typed by the user, or identifiers.
 */
export type TelemetryEvent =
  | 'app_opened'
  | 'card_read_more'
  | 'card_shared'
  | 'bookmark_added'
  | 'notification_opened'
  | 'notifications_enabled';

let enabled = true;
let posthog: PostHog | undefined;

export function initTelemetry(): void {
  if (config.sentryDsn) {
    Sentry.init({
      dsn: config.sentryDsn,
      sendDefaultPii: false,
      tracesSampleRate: 0,
      beforeSend: (event) => (enabled ? event : null),
    });
  }
  if (config.posthogKey) {
    posthog = new PostHog(config.posthogKey, {
      host: config.posthogHost,
      captureAppLifecycleEvents: false,
    });
  }
}

export function setTelemetryEnabled(value: boolean): void {
  enabled = value;
  if (posthog) void (value ? posthog.optIn() : posthog.optOut());
}

export function track(
  event: TelemetryEvent,
  properties?: Record<string, string | number | boolean>,
): void {
  if (enabled) posthog?.capture(event, properties);
}

export function captureError(error: unknown): void {
  if (enabled && config.sentryDsn) Sentry.captureException(error);
}

/** Wraps the root component so Sentry can capture render errors and app starts. */
export const withTelemetry = <P extends Record<string, unknown>>(
  component: React.ComponentType<P>,
): React.ComponentType<P> => (config.sentryDsn ? Sentry.wrap(component) : component);
