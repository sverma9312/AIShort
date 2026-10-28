import type { Card } from '@aishort/shared';
import Constants from 'expo-constants';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { z } from 'zod';
import { config } from './config';
import { fetchMeta, mergeBaseUrls, type FetchFn } from './feedClient';
import { loadSnapshot, refreshSnapshot, type FeedSnapshot } from './feedRepository';
import { deviceStorage, readJson, STORAGE_KEYS, writeJson, type KeyValueStore } from './storage';
import { isUpdateRequired } from './version';

/** Revalidate when the app returns to the foreground after at least this long. */
const FOREGROUND_REFRESH_MS = 5 * 60_000;

export type FeedStatus = 'loading' | 'ready' | 'refreshing' | 'error';

interface FeedContextValue {
  cards: Card[];
  status: FeedStatus;
  /** True when the last refresh failed but cached cards are shown. */
  offline: boolean;
  error?: string;
  /** Last time the feed was confirmed current. */
  checkedAt?: string;
  /** Ids added by the most recent refresh. */
  newCardIds: string[];
  updateRequired: boolean;
  refresh: () => Promise<void>;
}

const FeedContext = createContext<FeedContextValue | undefined>(undefined);

export interface FeedProviderProps {
  children: ReactNode;
  store?: KeyValueStore;
  fetch?: FetchFn;
  baseUrls?: readonly string[];
  appVersion?: string;
}

export function FeedProvider({
  children,
  store = deviceStorage,
  fetch,
  baseUrls: builtInBaseUrls = config.feedBaseUrls,
  appVersion = Constants.expoConfig?.version,
}: FeedProviderProps) {
  const [snapshot, setSnapshot] = useState<FeedSnapshot>();
  const [status, setStatus] = useState<FeedStatus>('loading');
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string>();
  const [newCardIds, setNewCardIds] = useState<string[]>([]);
  const [updateRequired, setUpdateRequired] = useState(false);
  const snapshotRef = useRef<FeedSnapshot | undefined>(undefined);
  const baseUrlsRef = useRef<string[]>([...builtInBaseUrls]);
  const inFlight = useRef<Promise<void> | undefined>(undefined);

  const refresh = useCallback(() => {
    // Coalesce overlapping refreshes (foreground + pull-to-refresh + mount).
    inFlight.current ??= (async () => {
      setStatus(snapshotRef.current ? 'refreshing' : 'loading');
      try {
        const result = await refreshSnapshot({
          store,
          baseUrls: baseUrlsRef.current,
          ...(snapshotRef.current ? { previous: snapshotRef.current } : {}),
          ...(fetch ? { fetch } : {}),
        });
        snapshotRef.current = result.snapshot;
        setSnapshot(result.snapshot);
        setNewCardIds(result.newCardIds);
        setOffline(false);
        setError(undefined);
        setStatus('ready');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setOffline(Boolean(snapshotRef.current));
        setStatus(snapshotRef.current ? 'ready' : 'error');
      } finally {
        inFlight.current = undefined;
      }
    })();
    return inFlight.current;
  }, [store, fetch]);

  // Startup: show the cache immediately, learn feed URLs from meta.json, then revalidate.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const savedUrls = await readJson(store, STORAGE_KEYS.feedBaseUrls, z.array(z.string()));
      baseUrlsRef.current = mergeBaseUrls(savedUrls, builtInBaseUrls);
      const cached = await loadSnapshot(store);
      if (cancelled) return;
      if (cached) {
        snapshotRef.current = cached;
        setSnapshot(cached);
        setStatus('ready');
      }
      void fetchMeta(baseUrlsRef.current, fetch).then(async (meta) => {
        if (!meta || cancelled) return;
        baseUrlsRef.current = mergeBaseUrls(meta.feedBaseUrls, builtInBaseUrls);
        await writeJson(store, STORAGE_KEYS.feedBaseUrls, meta.feedBaseUrls);
        setUpdateRequired(isUpdateRequired(appVersion, meta.minAppVersion));
      });
      await refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [store, fetch, builtInBaseUrls, appVersion, refresh]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      const checkedAt = snapshotRef.current?.checkedAt;
      if (
        state === 'active' &&
        (!checkedAt || Date.now() - new Date(checkedAt).getTime() > FOREGROUND_REFRESH_MS)
      ) {
        void refresh();
      }
    });
    return () => subscription.remove();
  }, [refresh]);

  const value = useMemo<FeedContextValue>(
    () => ({
      cards: snapshot?.feed.cards ?? [],
      status,
      offline,
      ...(error ? { error } : {}),
      ...(snapshot ? { checkedAt: snapshot.checkedAt } : {}),
      newCardIds,
      updateRequired,
      refresh,
    }),
    [snapshot, status, offline, error, newCardIds, updateRequired, refresh],
  );
  return <FeedContext.Provider value={value}>{children}</FeedContext.Provider>;
}

export function useFeed(): FeedContextValue {
  const value = useContext(FeedContext);
  if (!value) throw new Error('useFeed must be used inside <FeedProvider>');
  return value;
}
