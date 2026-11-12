import { Stack, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NewsCard } from '@/components/NewsCard';
import { StateView } from '@/components/StateView';
import { useBookmarks } from '@/lib/bookmarks';
import { useFeed } from '@/lib/feed';
import { findCard } from '@/lib/feedRepository';
import { useTheme } from '@/lib/theme';

/** A single card: opened from a notification, a deep link (aishort://card/<id>) or a bookmark. */
export default function CardScreen() {
  const theme = useTheme();
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
      <Stack.Screen options={{ title: card.sourceName, headerBackTitle: 'Back' }} />
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['bottom']}>
        <NewsCard card={card} bookmarked={isBookmarked(card.id)} onToggleBookmark={toggle} />
      </SafeAreaView>
    </>
  );
}
