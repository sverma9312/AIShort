import { cardIdFromNotification, savePushToken } from '../push';

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
