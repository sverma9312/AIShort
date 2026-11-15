import type { Card } from '@aishort/shared';
import * as Notifications from 'expo-notifications';
import { memoryStorage, STORAGE_KEYS, writeJson } from '../../lib/storage';
import { cardIdFromNotification, savePushToken, syncTopStoryNotifications } from '../push';

const TOKEN = 'ExponentPushToken[abcdefghijklmnop]';
const options = (status: number, calls: { url: string; init?: RequestInit }[] = []) => ({
  supabaseUrl: 'https://proj.supabase.co/',
  anonKey: 'anon-key',
  fetch: (url: string, init?: RequestInit) => {
    calls.push({ url, ...(init ? { init } : {}) });
    return Promise.resolve(new Response(null, { status }));
  },
});

describe('savePushToken', () => {
  it('inserts the token with the anon key', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    await savePushToken(TOKEN, 'android', options(201, calls));
    expect(calls[0]?.url).toBe('https://proj.supabase.co/rest/v1/push_tokens');
    expect(calls[0]?.init?.headers).toMatchObject({
      apikey: 'anon-key',
      Authorization: 'Bearer anon-key',
    });
    expect(JSON.parse(calls[0]?.init?.body as string)).toEqual({
      token: TOKEN,
      platform: 'android',
    });
  });

  it('treats an already-registered token (409) as success', async () => {
    await expect(savePushToken(TOKEN, 'ios', options(409))).resolves.toBeUndefined();
  });

  it('throws on other failures', async () => {
    await expect(savePushToken(TOKEN, 'ios', options(500))).rejects.toThrow(/HTTP 500/);
  });
});

describe('cardIdFromNotification', () => {
  it('accepts only well-formed card ids', () => {
    expect(cardIdFromNotification({ cardId: 'c_0123456789abcdef' })).toBe('c_0123456789abcdef');
    expect(cardIdFromNotification({ cardId: '../settings' })).toBeUndefined();
    expect(cardIdFromNotification(undefined)).toBeUndefined();
  });
});

describe('syncTopStoryNotifications', () => {
  const cardA: Card = {
    id: 'c_0123456789abcdef',
    headline: 'Anthropic releases Claude 3.5 Sonnet upgrade',
    summary: 'New model excels in reasoning and coding with sub-second response times.',
    category: 'models',
    importance: 8,
    sourceName: 'TechCrunch',
    sourceUrl: 'https://techcrunch.com/claude-35',
    imageUrl: null,
    publishedAt: '2026-11-15T10:00:00Z',
  };

  it('suppresses notification if notifications setting is disabled', async () => {
    const store = memoryStorage();
    await writeJson(store, STORAGE_KEYS.settings, { notifications: false });
    const res = await syncTopStoryNotifications([cardA], store);
    expect(res.notified).toBe(false);
    expect(res.reason).toMatch(/notifications disabled/);
  });

  it('notifies on new unread card when enabled', async () => {
    const store = memoryStorage();
    await writeJson(store, STORAGE_KEYS.settings, { notifications: true });
    const res = await syncTopStoryNotifications([cardA], store);
    expect(res.notified).toBe(true);
    expect(res.cardId).toBe(cardA.id);
  });

  it('suppresses notification if card is already marked as read', async () => {
    const store = memoryStorage();
    await writeJson(store, STORAGE_KEYS.settings, { notifications: true });
    await writeJson(store, STORAGE_KEYS.readCards, [cardA.id]);
    const res = await syncTopStoryNotifications([cardA], store);
    expect(res.notified).toBe(false);
    expect(res.reason).toMatch(/no new unread stories/);
  });

  it('suppresses duplicate notifications for already notified card', async () => {
    const store = memoryStorage();
    await writeJson(store, STORAGE_KEYS.settings, { notifications: true });
    await writeJson(store, STORAGE_KEYS.notifiedCards, [cardA.id]);
    const res = await syncTopStoryNotifications([cardA], store);
    expect(res.notified).toBe(false);
    expect(res.reason).toMatch(/no new unread stories/);
  });

  it('enforces daily limit of max 2 notifications per day', async () => {
    const store = memoryStorage();
    const today = new Date().toISOString().slice(0, 10);
    await writeJson(store, STORAGE_KEYS.settings, { notifications: true });
    await writeJson(store, STORAGE_KEYS.notificationDailyLog, { date: today, count: 2 });
    const res = await syncTopStoryNotifications([cardA], store);
    expect(res.notified).toBe(false);
    expect(res.reason).toMatch(/daily limit reached/);
  });
});
