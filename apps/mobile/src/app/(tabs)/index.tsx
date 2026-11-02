import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import PagerView from 'react-native-pager-view';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Banner } from '@/components/Banner';
import { CategoryChips, type CategoryFilter } from '@/components/CategoryChips';
import { NewsCard } from '@/components/NewsCard';
import { StateView } from '@/components/StateView';
import { useBookmarks } from '@/lib/bookmarks';
import { useFeed } from '@/lib/feed';
import { isPushAvailable, PROMPT_AFTER_CARDS, registerForPushNotifications } from '@/lib/push';
import { useReadHistory } from '@/lib/readHistory';
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
  const {
    readCardIds,
    isCaughtUp,
    loaded: readHistoryLoaded,
    markCardAsRead,
    setCaughtUp,
  } = useReadHistory();

  const [filter, setFilter] = useState<CategoryFilter>('all');
  const [index, setIndex] = useState(0);
  const [dismissedNew, setDismissedNew] = useState<string>();
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [updateFeedback, setUpdateFeedback] = useState<string | null>(null);
  const [showAllRead, setShowAllRead] = useState(false);
  const pager = useRef<PagerView>(null);

  const visible = useMemo(
    () =>
      cards.filter(
        (c) =>
          settings.categories.includes(c.category) && (filter === 'all' || c.category === filter),
      ),
    [cards, settings.categories, filter],
  );

  const unreadCards = useMemo(
    () => visible.filter((c) => !readCardIds.has(c.id)),
    [visible, readCardIds],
  );

  // If user tapped "Review past stories", show all; otherwise show unread cards
  const displayCards = showAllRead ? visible : unreadCards;

  // The user is caught up if read history has loaded, not reviewing past stories,
  // and all visible stories in this filter have been read.
  const userIsCaughtUp =
    readHistoryLoaded &&
    !showAllRead &&
    visible.length > 0 &&
    unreadCards.length === 0;

  // Periodically check for new stories every 2.5 minutes while the app is sitting open
  useEffect(() => {
    const timer = setInterval(() => {
      void refresh();
    }, 2.5 * 60_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const selectFilter = useCallback((next: CategoryFilter) => {
    setFilter(next);
    setIndex(0);
    setShowAllRead(false);
    setUpdateFeedback(null);
  }, []);

  const onPageSelected = useCallback(
    (position: number) => {
      setIndex(position);
      update({ cardsViewed: settings.cardsViewed + 1 });

      // Mark current card as read
      if (position < displayCards.length) {
        const currentCard = displayCards[position];
        if (currentCard) markCardAsRead(currentCard.id);
      } else if (position === displayCards.length) {
        // Reached the caught-up screen at the end of the pager
        setCaughtUp(true);
      }
    },
    [displayCards, markCardAsRead, setCaughtUp, settings.cardsViewed, update],
  );

  // Mark first card as read once displayed
  useEffect(() => {
    if (displayCards.length > 0 && index === 0 && displayCards[0]) {
      markCardAsRead(displayCards[0].id);
    }
  }, [displayCards, index, markCardAsRead]);

  // Handle active "Check for updates" with live feedback
  const handleCheckUpdates = useCallback(async () => {
    setIsCheckingUpdates(true);
    setUpdateFeedback(null);
    try {
      const result = await refresh();
      // Brief delay for tactile feedback
      await new Promise((resolve) => setTimeout(resolve, 600));
      const newlyFetched = result?.newCardIds ?? [];
      if (newlyFetched.length > 0) {
        setUpdateFeedback(
          `Found ${newlyFetched.length} new ${newlyFetched.length === 1 ? 'story' : 'stories'}!`,
        );
        setShowAllRead(false);
        setCaughtUp(false);
        setIndex(0);
      } else {
        setUpdateFeedback('✓ Up to date (checked just now)');
      }
    } catch {
      setUpdateFeedback('Could not reach feed. Please try again.');
    } finally {
      setIsCheckingUpdates(false);
    }
  }, [refresh, setCaughtUp]);

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
  const showNewPill = newCardIds.length > 0 && dismissedNew !== newKey;

  const renderCaughtUpCard = (inPager = false) => (
    <View style={[styles.caughtUpContainer, { backgroundColor: theme.card }]}>
      <View style={[styles.caughtUpIconCircle, { backgroundColor: theme.chip }]}>
        <Ionicons name="checkmark-circle-outline" size={56} color={theme.accent} />
      </View>
      <Text style={[styles.caughtUpTitle, { color: theme.text }]}>You're all caught up!</Text>
      <Text style={[styles.caughtUpMessage, { color: theme.muted }]}>
        {filter === 'all'
          ? "You've read all the latest stories. We continuously monitor 26 AI sources, so check back soon for fresh updates."
          : `You've read all stories in ${filter}. Check back soon for fresh updates.`}
      </Text>

      {updateFeedback ? (
        <View style={[styles.feedbackBadge, { backgroundColor: theme.chip }]}>
          <Text style={[styles.feedbackText, { color: theme.accent }]}>{updateFeedback}</Text>
        </View>
      ) : null}

      <View style={styles.caughtUpActions}>
        {unreadCards.length > 0 ? (
          <Pressable
            onPress={() => {
              setShowAllRead(false);
              setIndex(0);
            }}
            style={[styles.caughtUpButton, { backgroundColor: '#10B981' }]}
            accessibilityRole="button"
          >
            <Ionicons name="sparkles" size={18} color="#FFFFFF" style={styles.buttonIcon} />
            <Text style={[styles.caughtUpButtonText, { color: '#FFFFFF' }]}>
              Read new stories ({unreadCards.length})
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => void handleCheckUpdates()}
          disabled={isCheckingUpdates}
          style={[styles.caughtUpButton, { backgroundColor: theme.accent, opacity: isCheckingUpdates ? 0.7 : 1 }]}
          accessibilityRole="button"
        >
          {isCheckingUpdates ? (
            <ActivityIndicator size="small" color={theme.accentText} style={styles.buttonIcon} />
          ) : (
            <Ionicons name="refresh" size={18} color={theme.accentText} style={styles.buttonIcon} />
          )}
          <Text style={[styles.caughtUpButtonText, { color: theme.accentText }]}>
            {isCheckingUpdates ? 'Checking for updates…' : 'Check for updates'}
          </Text>
        </Pressable>

        {inPager ? (
          <Pressable
            onPress={() => pager.current?.setPage(0)}
            style={[styles.caughtUpButtonSecondary, { borderColor: theme.border }]}
            accessibilityRole="button"
          >
            <Ionicons name="arrow-up" size={18} color={theme.text} style={styles.buttonIcon} />
            <Text style={[styles.caughtUpButtonTextSecondary, { color: theme.text }]}>Back to top</Text>
          </Pressable>
        ) : visible.length > 0 ? (
          <Pressable
            onPress={() => {
              setShowAllRead(true);
              setIndex(0);
            }}
            style={[styles.caughtUpButtonSecondary, { borderColor: theme.border }]}
            accessibilityRole="button"
          >
            <Ionicons name="book-outline" size={18} color={theme.text} style={styles.buttonIcon} />
            <Text style={[styles.caughtUpButtonTextSecondary, { color: theme.text }]}>
              Review past stories ({visible.length})
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );

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
  } else if (userIsCaughtUp) {
    // Directly show caught-up screen when user is already caught up
    body = renderCaughtUpCard(false);
  } else {
    body = (
      <PagerView
        key={`${filter}-${showAllRead ? 'all' : 'unread'}`}
        ref={pager}
        style={styles.pager}
        orientation="vertical"
        initialPage={0}
        onPageSelected={(e) => onPageSelected(e.nativeEvent.position)}
        testID="feed-pager"
      >
        {displayCards.map((card, i) => (
          <View key={card.id} style={styles.page} collapsable={false}>
            {Math.abs(i - index) <= RENDER_WINDOW ? (
              <NewsCard card={card} bookmarked={isBookmarked(card.id)} onToggleBookmark={toggle} />
            ) : null}
          </View>
        ))}
        <View key="caught-up-end" style={styles.page} collapsable={false}>
          {Math.abs(displayCards.length - index) <= RENDER_WINDOW ? renderCaughtUpCard(true) : null}
        </View>
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
          onPress={() => void handleCheckUpdates()}
          hitSlop={12}
          style={styles.refresh}
          accessibilityRole="button"
          accessibilityLabel="Refresh"
          testID="refresh"
        >
          {isCheckingUpdates ? (
            <ActivityIndicator size="small" color={theme.text} />
          ) : (
            <Ionicons
              name={status === 'refreshing' ? 'hourglass-outline' : 'refresh'}
              size={22}
              color={theme.text}
            />
          )}
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
            setShowAllRead(false);
            setCaughtUp(false);
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
  caughtUpContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    margin: 16,
    borderRadius: 20,
  },
  caughtUpIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  caughtUpTitle: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
  },
  caughtUpMessage: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 20,
  },
  feedbackBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 20,
  },
  feedbackText: {
    fontSize: 14,
    fontWeight: '600',
  },
  caughtUpActions: {
    width: '100%',
    gap: 12,
  },
  caughtUpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  caughtUpButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  caughtUpButtonSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  caughtUpButtonTextSecondary: {
    fontSize: 16,
    fontWeight: '600',
  },
  buttonIcon: {
    marginRight: 6,
  },
});
