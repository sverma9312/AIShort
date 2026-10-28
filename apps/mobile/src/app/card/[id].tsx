import { Stack, useLocalSearchParams } from 'expo-router';
import { NewsCard } from '@/components/NewsCard';
import { StateView } from '@/components/StateView';
import { useBookmarks } from '@/lib/bookmarks';
import { useFeed } from '@/lib/feed';
import { findCard } from '@/lib/feedRepository';

/** A single card: opened from a notification, a deep link (aishort://card/<id>) or a bookmark. */
export default function CardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { cards, status } = useFeed();
  const { bookmarks, isBookmarked, toggle } = useBookmarks();
  const card = findCard(cards, id) ?? findCard(bookmarks, id);

  if (!card) {
    return status === 'loading' || status === 'refreshing' ? (
      <StateView kind="loading" />
    ) : (
      <StateView
        kind="empty"
        title="Story not found"
        message="It may have dropped out of the feed."
      />
    );
  }
  return (
    <>
      <Stack.Screen options={{ title: card.sourceName }} />
      <NewsCard card={card} bookmarked={isBookmarked(card.id)} onToggleBookmark={toggle} />
    </>
  );
}
