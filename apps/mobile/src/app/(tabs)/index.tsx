import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import PagerView from 'react-native-pager-view';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Banner } from '@/components/Banner';
import { CategoryChips, type CategoryFilter } from '@/components/CategoryChips';
import { NewsCard } from '@/components/NewsCard';
import { StateView } from '@/components/StateView';
import { useBookmarks } from '@/lib/bookmarks';
import { useFeed } from '@/lib/feed';
import { isPushAvailable, PROMPT_AFTER_CARDS, registerForPushNotifications } from '@/lib/push';
import { useSettings } from '@/lib/settings';
import { track } from '@/lib/telemetry';
import { useTheme } from '@/lib/theme';

/** Only cards this close to the current one are rendered; the rest are empty pages. */
const RENDER_WINDOW = 2;

export default function FeedScreen() {
  const theme = useTheme();
  const { cards, status, offline, newCardIds, updateRequired, refresh } = useFeed();
  const { settings, update } = useSettings();
  const { isBookmarked, toggle } = useBookmarks();
  const [filter, setFilter] = useState<CategoryFilter>('all');
  const [index, setIndex] = useState(0);
  const [dismissedNew, setDismissedNew] = useState<string>();
  const pager = useRef<PagerView>(null);

  const visible = useMemo(
    () =>
      cards.filter(
        (c) =>
          settings.categories.includes(c.category) && (filter === 'all' || c.category === filter),
      ),
    [cards, settings.categories, filter],
  );

  const selectFilter = useCallback((next: CategoryFilter) => {
    setFilter(next);
    setIndex(0);
  }, []);

  const onPageSelected = useCallback(
    (position: number) => {
      setIndex(position);
      update({ cardsViewed: settings.cardsViewed + 1 });
    },
    [update, settings.cardsViewed],
  );

  // Ask about notifications once the reader has seen enough cards to know the app.
  useEffect(() => {
    if (
      settings.cardsViewed < PROMPT_AFTER_CARDS ||
      settings.notifications !== undefined ||
      !isPushAvailable()
    )
      return;
    Alert.alert(
      'Get top AI stories?',
      'We send at most two alerts a day, only for the biggest AI news.',
      [
        { text: 'Not now', style: 'cancel', onPress: () => update({ notifications: false }) },
        {
          text: 'Turn on',
          onPress: () => {
            void registerForPushNotifications().then((result) => {
              update({ notifications: result.status === 'registered' });
              if (result.status === 'registered') track('notifications_enabled');
            });
          },
        },
      ],
    );
  }, [settings.cardsViewed, settings.notifications, update]);

  const newKey = newCardIds.join(',');
  const showNewPill = newCardIds.length > 0 && index > 0 && dismissedNew !== newKey;

  let body;
  if (!cards.length && status === 'loading') {
    body = <StateView kind="loading" message="Loading the latest AI news…" />;
  } else if (!cards.length && status === 'error') {
    body = (
      <StateView
        kind="error"
        title="Can't load the news"
        message="Check your connection and try again."
        actionLabel="Retry"
        onAction={() => void refresh()}
      />
    );
  } else if (!visible.length) {
    body = (
      <StateView
        kind="empty"
        title="No stories here yet"
        message="Try another category, or check back soon."
      />
    );
  } else {
    body = (
      <PagerView
        key={filter}
        ref={pager}
        style={styles.pager}
        orientation="vertical"
        initialPage={0}
        onPageSelected={(e) => onPageSelected(e.nativeEvent.position)}
        testID="feed-pager"
      >
        {visible.map((card, i) => (
          <View key={card.id} style={styles.page} collapsable={false}>
            {Math.abs(i - index) <= RENDER_WINDOW ? (
              <NewsCard card={card} bookmarked={isBookmarked(card.id)} onToggleBookmark={toggle} />
            ) : null}
          </View>
        ))}
      </PagerView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <View
        style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}
      >
        <View style={styles.chips}>
          <CategoryChips
            categories={settings.categories}
            selected={filter}
            onSelect={selectFilter}
          />
        </View>
        <Pressable
          onPress={() => void refresh()}
          hitSlop={12}
          style={styles.refresh}
          accessibilityRole="button"
          accessibilityLabel="Refresh"
          testID="refresh"
        >
          <Ionicons
            name={status === 'refreshing' ? 'hourglass-outline' : 'refresh'}
            size={22}
            color={theme.text}
          />
        </Pressable>
      </View>
      {updateRequired ? (
        <Banner
          text="A new version of the app is available. Please update."
          testID="banner-update"
        />
      ) : null}
      {offline ? (
        <Banner text="You're offline — showing saved stories." testID="banner-offline" />
      ) : null}
      {showNewPill ? (
        <Banner
          text={`${newCardIds.length} new ${newCardIds.length === 1 ? 'story' : 'stories'} — tap to see`}
          onPress={() => {
            setDismissedNew(newKey);
            pager.current?.setPage(0);
          }}
          testID="banner-new"
        />
      ) : null}
      {body}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  chips: { flex: 1 },
  refresh: { paddingHorizontal: 16 },
  pager: { flex: 1 },
  page: { flex: 1 },
});
