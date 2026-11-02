import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { deviceStorage, readJson, STORAGE_KEYS, writeJson, type KeyValueStore } from './storage';

const ReadCardsSchema = z.array(z.string());

export function useReadHistory(store: KeyValueStore = deviceStorage) {
  const [readCardIds, setReadCardIds] = useState<Set<string>>(new Set());
  const [isCaughtUp, setIsCaughtUpState] = useState<boolean>(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [savedCards, savedCaughtUp] = await Promise.all([
        readJson(store, STORAGE_KEYS.readCards, ReadCardsSchema),
        readJson(store, STORAGE_KEYS.isCaughtUp, z.boolean()),
      ]);
      if (!cancelled) {
        if (savedCards) setReadCardIds(new Set(savedCards));
        if (typeof savedCaughtUp === 'boolean') setIsCaughtUpState(savedCaughtUp);
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store]);

  const markCardAsRead = useCallback(
    (cardId: string) => {
      setReadCardIds((prev) => {
        if (prev.has(cardId)) return prev;
        const next = new Set(prev).add(cardId);
        void writeJson(store, STORAGE_KEYS.readCards, Array.from(next));
        return next;
      });
    },
    [store],
  );

  const setCaughtUp = useCallback(
    (caughtUp: boolean) => {
      setIsCaughtUpState(caughtUp);
      void writeJson(store, STORAGE_KEYS.isCaughtUp, caughtUp);
    },
    [store],
  );

  const resetReadHistory = useCallback(() => {
    setReadCardIds(new Set());
    setIsCaughtUpState(false);
    void Promise.all([
      store.removeItem(STORAGE_KEYS.readCards),
      store.removeItem(STORAGE_KEYS.isCaughtUp),
    ]);
  }, [store]);

  return {
    readCardIds,
    isCaughtUp,
    loaded,
    markCardAsRead,
    setCaughtUp,
    resetReadHistory,
  };
}
