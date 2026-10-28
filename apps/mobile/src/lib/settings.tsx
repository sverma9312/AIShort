import { CategorySchema, type Category } from '@aishort/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { z } from 'zod';
import { ALL_CATEGORIES } from './categories';
import { deviceStorage, readJson, STORAGE_KEYS, writeJson, type KeyValueStore } from './storage';

export const SettingsSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']).default('system'),
  /** Categories shown in the feed. */
  categories: z.array(CategorySchema).default([...ALL_CATEGORIES]),
  /** undefined = never asked; true/false = the user's choice. */
  notifications: z.boolean().optional(),
  /** Crash reports and anonymous usage analytics. */
  analytics: z.boolean().default(true),
  /** Cards viewed so far; used to time the notification prompt. */
  cardsViewed: z.number().int().min(0).default(0),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});

interface SettingsContextValue {
  settings: Settings;
  loaded: boolean;
  update: (patch: Partial<Settings>) => void;
  toggleCategory: (category: Category) => void;
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  update: () => {},
  toggleCategory: () => {},
});

export function SettingsProvider({
  children,
  store = deviceStorage,
}: {
  children: ReactNode;
  store?: KeyValueStore;
}) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void readJson(store, STORAGE_KEYS.settings, SettingsSchema).then((saved) => {
      if (saved) setSettings(saved);
      setLoaded(true);
    });
  }, [store]);

  const update = useCallback(
    (patch: Partial<Settings>) => {
      setSettings((current) => {
        const next = { ...current, ...patch };
        void writeJson(store, STORAGE_KEYS.settings, next);
        return next;
      });
    },
    [store],
  );

  const toggleCategory = useCallback(
    (category: Category) => {
      setSettings((current) => {
        const enabled = current.categories.includes(category);
        // Keep at least one category, or the feed would always be empty.
        if (enabled && current.categories.length === 1) return current;
        const categories = enabled
          ? current.categories.filter((c) => c !== category)
          : ALL_CATEGORIES.filter((c) => c === category || current.categories.includes(c));
        const next = { ...current, categories };
        void writeJson(store, STORAGE_KEYS.settings, next);
        return next;
      });
    },
    [store],
  );

  const value = useMemo(
    () => ({ settings, loaded, update, toggleCategory }),
    [settings, loaded, update, toggleCategory],
  );
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext);
}
