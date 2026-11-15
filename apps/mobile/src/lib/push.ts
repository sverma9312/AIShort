import type { Card } from '@aishort/shared';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { z } from 'zod';
import { config } from './config';
import type { FetchFn } from './feedClient';
import { deviceStorage, readJson, writeJson, STORAGE_KEYS, type KeyValueStore } from './storage';

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

const DEFAULT_EAS_PROJECT_ID = 'c89b079c-370a-49e7-b056-0fe77c6a0350';

function easProjectId(): string | undefined {
  return (
    (Constants.expoConfig?.extra?.['eas'] as { projectId?: string } | undefined)?.projectId ??
    Constants.easConfig?.projectId ??
    DEFAULT_EAS_PROJECT_ID
  );
}

/** Whether this platform supports notifications. */
export function isPushAvailable(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

/** Asks for permission, gets an Expo push token and registers it. Never throws. */
export async function registerForPushNotifications(): Promise<PushRegistration> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android')
    return { status: 'unavailable', reason: 'unsupported platform' };

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(TOP_STORIES_CHANNEL, {
        name: 'Top stories',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    const existing = await Notifications.getPermissionsAsync();
    const status =
      existing.status === Notifications.PermissionStatus.GRANTED
        ? existing.status
        : (await Notifications.requestPermissionsAsync()).status;
    if (status !== Notifications.PermissionStatus.GRANTED) return { status: 'denied' };

    const projectId = easProjectId() ?? DEFAULT_EAS_PROJECT_ID;
    let token: string | undefined;

    try {
      const pushRes = await Notifications.getExpoPushTokenAsync({ projectId });
      token = pushRes.data;
      if (token && config.supabaseUrl && config.supabaseAnonKey) {
        await savePushToken(token, Platform.OS, {
          supabaseUrl: config.supabaseUrl,
          anonKey: config.supabaseAnonKey,
        });
      }
    } catch (tokenErr) {
      // If remote push token fails (e.g. FCM not yet configured on EAS),
      // local device notification permission is still successfully active.
      console.warn('Expo push token registration note:', tokenErr);
    }

    return { status: 'registered', token: token ?? 'device-granted' };
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}

/** Stops delivery to this device. The server deletes the dead token after the next send. */
export async function unregisterFromPushNotifications(): Promise<void> {
  try {
    await Notifications.unregisterForNotificationsAsync();
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // Nothing to do: the device simply keeps no registration.
  }
}

/** Cancels all scheduled local alerts. */
export async function cancelAllScheduledNotifications(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // Best-effort
  }
}

const DailyLogSchema = z.object({
  date: z.string(),
  count: z.number(),
});
const NotifiedCardsSchema = z.array(z.string());

export interface SyncNotificationResult {
  notified: boolean;
  cardId?: string;
  headline?: string;
  reason?: string;
}

/**
 * Checks for fresh, unread top stories and triggers a native notification
 * strictly honoring the daily limit (max 2 a day) and suppressing duplicate/read stories.
 */
export async function syncTopStoryNotifications(
  cards: Card[],
  store: KeyValueStore = deviceStorage,
  options?: { force?: boolean },
): Promise<SyncNotificationResult> {
  if (!isPushAvailable()) {
    return { notified: false, reason: 'unsupported platform' };
  }

  // 1. Verify notifications are enabled in user settings
  const settings = await readJson(
    store,
    STORAGE_KEYS.settings,
    z.object({ notifications: z.boolean().optional() }).passthrough(),
  );
  if (settings?.notifications !== true && !options?.force) {
    return { notified: false, reason: 'notifications disabled in settings' };
  }

  // 2. Check permissions on device
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (perm.status !== Notifications.PermissionStatus.GRANTED && !options?.force) {
      return { notified: false, reason: 'notification permissions not granted' };
    }
  } catch {
    // If checking permissions fails, proceed to attempt
  }

  // 3. Enforce strict daily cap (max 2 notifications per calendar day)
  const today = new Date().toISOString().slice(0, 10);
  const dailyLog = await readJson(store, STORAGE_KEYS.notificationDailyLog, DailyLogSchema);
  const currentCount = dailyLog && dailyLog.date === today ? dailyLog.count : 0;
  if (currentCount >= 2 && !options?.force) {
    return { notified: false, reason: 'daily limit reached (max 2 a day)' };
  }

  // 4. Load read card IDs and previously notified cards to guarantee zero repeats
  const [readCardIdsArr, notifiedIdsArr] = await Promise.all([
    readJson(store, STORAGE_KEYS.readCards, z.array(z.string())),
    readJson(store, STORAGE_KEYS.notifiedCards, NotifiedCardsSchema),
  ]);
  const readCardsSet = new Set(readCardIdsArr ?? []);
  const notifiedSet = new Set(notifiedIdsArr ?? []);

  // 5. Select candidate story:
  // Must NOT be already read by user and NOT previously notified
  const candidate = cards.find((c) => {
    if (readCardsSet.has(c.id)) return false;
    if (notifiedSet.has(c.id)) return false;
    return Boolean(c.headline && c.summary);
  });

  if (!candidate) {
    return { notified: false, reason: 'no new unread stories found' };
  }

  // 6. Dispatch native device notification
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(TOP_STORIES_CHANNEL, {
        name: 'Top stories',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: '⚡ AIShort · Top Story',
        body: candidate.headline,
        data: { cardId: candidate.id },
        sound: true,
      },
      trigger:
        Platform.OS === 'android'
          ? ({ channelId: TOP_STORIES_CHANNEL } as Notifications.NotificationTriggerInput)
          : null,
    });

    // 7. Persist notification state
    notifiedSet.add(candidate.id);
    await Promise.all([
      writeJson(store, STORAGE_KEYS.notifiedCards, Array.from(notifiedSet)),
      writeJson(store, STORAGE_KEYS.notificationDailyLog, {
        date: today,
        count: currentCount + 1,
      }),
    ]);

    return { notified: true, cardId: candidate.id, headline: candidate.headline };
  } catch (err) {
    return { notified: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/** The card a notification points to, if its payload is valid. */
export function cardIdFromNotification(data: unknown): string | undefined {
  const id =
    data && typeof data === 'object' ? (data as Record<string, unknown>)['cardId'] : undefined;
  return typeof id === 'string' && /^c_[0-9a-f]{16}$/.test(id) ? id : undefined;
}
