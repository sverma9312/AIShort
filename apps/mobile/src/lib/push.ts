import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { config } from './config';
import type { FetchFn } from './feedClient';

export const TOP_STORIES_CHANNEL = 'top-stories';

/** Ask for notification permission after this many cards, once the user knows the app. */
export const PROMPT_AFTER_CARDS = 10;

export type PushRegistration =
  | { status: 'registered'; token: string }
  | { status: 'denied' }
  | { status: 'unavailable'; reason: string }
  | { status: 'error'; message: string };

/**
 * Stores an Expo push token in Supabase with the anon key. RLS allows only INSERT, so a token
 * that's already registered comes back as 409 Conflict — that counts as success.
 */
export async function savePushToken(
  token: string,
  platform: 'ios' | 'android',
  options: { supabaseUrl: string; anonKey: string; fetch?: FetchFn },
): Promise<void> {
  const fetchFn = options.fetch ?? ((input, init) => fetch(input, init));
  const response = await fetchFn(`${options.supabaseUrl.replace(/\/+$/, '')}/rest/v1/push_tokens`, {
    method: 'POST',
    headers: {
      apikey: options.anonKey,
      Authorization: `Bearer ${options.anonKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ token, platform }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok && response.status !== 409) {
    throw new Error(`Saving push token failed: HTTP ${response.status}`);
  }
}

function easProjectId(): string | undefined {
  return (
    (Constants.expoConfig?.extra?.['eas'] as { projectId?: string } | undefined)?.projectId ??
    Constants.easConfig?.projectId
  );
}

/** Whether this build can receive pushes at all (so the app doesn't ask for nothing). */
export function isPushAvailable(): boolean {
  return (
    (Platform.OS === 'ios' || Platform.OS === 'android') &&
    Device.isDevice &&
    Boolean(easProjectId() && config.supabaseUrl && config.supabaseAnonKey)
  );
}

/** Asks for permission, gets an Expo push token and registers it. Never throws. */
export async function registerForPushNotifications(): Promise<PushRegistration> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android')
    return { status: 'unavailable', reason: 'unsupported platform' };
  if (!Device.isDevice) return { status: 'unavailable', reason: 'push needs a physical device' };
  const projectId = easProjectId();
  if (!projectId) return { status: 'unavailable', reason: 'EAS project ID not configured' };
  if (!config.supabaseUrl || !config.supabaseAnonKey)
    return { status: 'unavailable', reason: 'Supabase not configured' };

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(TOP_STORIES_CHANNEL, {
        name: 'Top stories',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const existing = await Notifications.getPermissionsAsync();
    const status =
      existing.status === Notifications.PermissionStatus.GRANTED
        ? existing.status
        : (await Notifications.requestPermissionsAsync()).status;
    if (status !== Notifications.PermissionStatus.GRANTED) return { status: 'denied' };

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await savePushToken(token, Platform.OS, {
      supabaseUrl: config.supabaseUrl,
      anonKey: config.supabaseAnonKey,
    });
    return { status: 'registered', token };
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}

/** Stops delivery to this device. The server deletes the dead token after the next send. */
export async function unregisterFromPushNotifications(): Promise<void> {
  try {
    await Notifications.unregisterForNotificationsAsync();
  } catch {
    // Nothing to do: the device simply keeps no registration.
  }
}

/** The card a notification points to, if its payload is valid. */
export function cardIdFromNotification(data: unknown): string | undefined {
  const id =
    data && typeof data === 'object' ? (data as Record<string, unknown>)['cardId'] : undefined;
  return typeof id === 'string' && /^c_[0-9a-f]{16}$/.test(id) ? id : undefined;
}
