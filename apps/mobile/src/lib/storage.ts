import AsyncStorage from '@react-native-async-storage/async-storage';
import type { z } from 'zod';

/** Minimal key/value interface (AsyncStorage in the app, an in-memory map in tests). */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export const deviceStorage: KeyValueStore = AsyncStorage;

export const STORAGE_KEYS = {
  feed: 'feed:snapshot:v1',
  feedBaseUrls: 'feed:baseUrls:v1',
  bookmarks: 'bookmarks:v1',
  settings: 'settings:v1',
} as const;

/** Reads and validates a JSON value; anything missing, corrupt or outdated yields undefined. */
export async function readJson<T>(
  store: KeyValueStore,
  key: string,
  schema: z.ZodType<T>,
): Promise<T | undefined> {
  try {
    const raw = await store.getItem(key);
    if (raw === null) return undefined;
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export async function writeJson(store: KeyValueStore, key: string, value: unknown): Promise<void> {
  await store.setItem(key, JSON.stringify(value));
}

export function memoryStorage(
  initial: Record<string, string> = {},
): KeyValueStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => Promise.resolve(data.get(key) ?? null),
    setItem: (key, value) => {
      data.set(key, value);
      return Promise.resolve();
    },
    removeItem: (key) => {
      data.delete(key);
      return Promise.resolve();
    },
  };
}
