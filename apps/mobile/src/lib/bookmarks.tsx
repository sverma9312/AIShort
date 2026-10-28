import { CardSchema, type Card } from '@aishort/shared';
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
import { deviceStorage, readJson, STORAGE_KEYS, writeJson, type KeyValueStore } from './storage';

// Bookmarks keep a full copy of each card, so they still open after leaving the feed.
const BookmarksSchema = z.array(CardSchema);

interface BookmarksContextValue {
  bookmarks: Card[];
  isBookmarked: (id: string) => boolean;
  toggle: (card: Card) => void;
  remove: (id: string) => void;
}

const BookmarksContext = createContext<BookmarksContextValue>({
  bookmarks: [],
  isBookmarked: () => false,
  toggle: () => {},
  remove: () => {},
});

export function BookmarksProvider({
  children,
  store = deviceStorage,
}: {
  children: ReactNode;
  store?: KeyValueStore;
}) {
  const [bookmarks, setBookmarks] = useState<Card[]>([]);

  useEffect(() => {
    void readJson(store, STORAGE_KEYS.bookmarks, BookmarksSchema).then((saved) => {
      if (saved) setBookmarks(saved);
    });
  }, [store]);

  const save = useCallback(
    (next: Card[]) => {
      void writeJson(store, STORAGE_KEYS.bookmarks, next);
      return next;
    },
    [store],
  );

  const toggle = useCallback(
    (card: Card) =>
      setBookmarks((current) =>
        save(
          current.some((c) => c.id === card.id)
            ? current.filter((c) => c.id !== card.id)
            : [card, ...current],
        ),
      ),
    [save],
  );
  const remove = useCallback(
    (id: string) => setBookmarks((current) => save(current.filter((c) => c.id !== id))),
    [save],
  );
  const isBookmarked = useCallback((id: string) => bookmarks.some((c) => c.id === id), [bookmarks]);

  const value = useMemo(
    () => ({ bookmarks, isBookmarked, toggle, remove }),
    [bookmarks, isBookmarked, toggle, remove],
  );
  return <BookmarksContext.Provider value={value}>{children}</BookmarksContext.Provider>;
}

export function useBookmarks(): BookmarksContextValue {
  return useContext(BookmarksContext);
}
