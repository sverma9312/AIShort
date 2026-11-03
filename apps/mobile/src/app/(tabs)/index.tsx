import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import PagerView from 'react-native-pager-view';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Banner } from '@/components/Banner';
import { CategoryChips, type CategoryFilter } from '@/components/CategoryChips';
import { NewsCard } from '@/components/NewsCard';
import { StateView } from '@/components/StateView';
import { Toast } from '@/components/Toast';
import { useBookmarks } from '@/lib/bookmarks';
import { CATEGORY_LABELS } from '@/lib/categories';
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
  const { readCardIds, loaded: readHistoryLoaded, markCardAsRead, setCaughtUp } = useReadHistory();

  const [filter, setFilter] = useState<CategoryFilter>('all');
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const [dismissedNew, setDismissedNew] = useState<string>();
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [pullThresholdMet, setPullThresholdMet] = useState(false);
  const pullAnim = useRef(new Animated.Value(0)).current;
  const isRefreshingRef = useRef(false);
  const pullThresholdMetRef = useRef(false);
  const [toast, setToast] = useState<{
    message: string;
    icon?: ComponentProps<typeof Ionicons>['name'];
  } | null>(null);
  type ReviewMode = 'none' | 'today' | 'all';
  const [reviewMode, setReviewMode] = useState<ReviewMode>('none');
  const [pagerEpoch, setPagerEpoch] = useState(0);
  const pager = useRef<PagerView>(null);

  const visible = useMemo(
    () =>
      cards.filter((c) => {
        if (!settings.categories.includes(c.category)) return false;
        if (filter === 'top') return c.importance >= 8;
        return filter === 'all' || c.category === filter;
      }),
    [cards, settings.categories, filter],
  );

  const unreadCards = useMemo(
    () => visible.filter((c) => !readCardIds.has(c.id)),
    [visible, readCardIds],
  );

  const todayCards = useMemo(() => {
    const now = new Date();
    return visible.filter((c) => {
      const cardDate = new Date(c.publishedAt);
      return (
        cardDate.getDate() === now.getDate() &&
        cardDate.getMonth() === now.getMonth() &&
        cardDate.getFullYear() === now.getFullYear()
      );
    });
  }, [visible]);

  // If user tapped "Review today's stories" or "Review all past stories", show that subset; otherwise show unread
  const displayCards = useMemo(() => {
    if (reviewMode === 'today') return todayCards;
    if (reviewMode === 'all') return visible;
    return unreadCards;
  }, [reviewMode, todayCards, visible, unreadCards]);

  // The user is caught up if read history has loaded, not reviewing past stories,
  // and all visible stories in this filter have been read.
  const userIsCaughtUp =
    readHistoryLoaded && reviewMode === 'none' && visible.length > 0 && unreadCards.length === 0;

  // Periodically check for new stories every 2.5 minutes while the app is sitting open
  useEffect(() => {
    const timer = setInterval(() => {
      void refresh();
    }, 2.5 * 60_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const selectFilter = useCallback((next: CategoryFilter) => {
    setFilter(next);
    indexRef.current = 0;
    setIndex(0);
    setPagerEpoch((e) => e + 1);
  }, []);

  const handleReadNewStories = useCallback(() => {
    setFilter('all');
    setCaughtUp(false);
    indexRef.current = 0;
    setIndex(0);
    const unread = cards.filter((c) => !readCardIds.has(c.id));
    if (unread.length === 0) {
      setReviewMode('today');
    } else {
      setReviewMode('none');
    }
    setPagerEpoch((e) => e + 1);
  }, [cards, readCardIds, setCaughtUp]);

  const onPageSelected = useCallback(
    (position: number) => {
      indexRef.current = position;
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

  // Handle active "Check for updates" with transient toast feedback
  const handleCheckUpdates = useCallback(async () => {
    setIsCheckingUpdates(true);
    isRefreshingRef.current = true;
    try {
      const result = await refresh();
      // Brief delay for tactile feedback
      await new Promise((resolve) => setTimeout(resolve, 500));
      const newlyFetched = result?.newCardIds ?? [];
      if (newlyFetched.length > 0) {
        setToast({
          message: `Found ${newlyFetched.length} new ${newlyFetched.length === 1 ? 'story' : 'stories'}!`,
          icon: 'sparkles',
        });
        setReviewMode('none');
        setCaughtUp(false);
        indexRef.current = 0;
        setIndex(0);
        setPagerEpoch((e) => e + 1);
      } else {
        setToast({ message: 'Up to date', icon: 'checkmark-circle' });
      }
    } catch {
      setToast({ message: 'Could not reach feed. Try again.', icon: 'alert-circle-outline' });
    } finally {
      setIsCheckingUpdates(false);
      isRefreshingRef.current = false;
    }
  }, [refresh, setCaughtUp]);

  // Gesture handler enabling reliable pull-to-refresh on the first card
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, gesture) => {
          return (
            indexRef.current === 0 &&
            gesture.dy > 8 &&
            Math.abs(gesture.dy) > Math.abs(gesture.dx) &&
            !isRefreshingRef.current
          );
        },
        onMoveShouldSetPanResponder: (_, gesture) => {
          return (
            indexRef.current === 0 &&
            gesture.dy > 8 &&
            Math.abs(gesture.dy) > Math.abs(gesture.dx) &&
            !isRefreshingRef.current
          );
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_, gesture) => {
          const pullDistance = Math.max(0, Math.min(gesture.dy * 0.45, 60));
          pullAnim.setValue(pullDistance);
          const met = pullDistance >= 38;
          if (met !== pullThresholdMetRef.current) {
            pullThresholdMetRef.current = met;
            setPullThresholdMet(met);
          }
        },
        onPanResponderRelease: (_, gesture) => {
          const shouldRefresh = gesture.dy * 0.45 >= 38;
          pullThresholdMetRef.current = false;
          setPullThresholdMet(false);

          if (shouldRefresh && !isRefreshingRef.current) {
            isRefreshingRef.current = true;
            Animated.spring(pullAnim, {
              toValue: 44,
              useNativeDriver: false,
            }).start();
            void handleCheckUpdates().finally(() => {
              isRefreshingRef.current = false;
              Animated.timing(pullAnim, {
                toValue: 0,
                duration: 200,
                useNativeDriver: false,
              }).start(() => {
                pullAnim.setValue(0);
              });
            });
          } else {
            Animated.timing(pullAnim, {
              toValue: 0,
              duration: 180,
              useNativeDriver: false,
            }).start(() => {
              pullAnim.setValue(0);
            });
          }
        },
        onPanResponderTerminate: () => {
          pullThresholdMetRef.current = false;
          setPullThresholdMet(false);
          isRefreshingRef.current = false;
          Animated.timing(pullAnim, {
            toValue: 0,
            duration: 180,
            useNativeDriver: false,
          }).start(() => {
            pullAnim.setValue(0);
          });
        },
      }),
    [handleCheckUpdates, pullAnim],
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
  const showNewPill = newCardIds.length > 0 && dismissedNew !== newKey;

  const renderCaughtUpCard = (inPager = false) => {
    const isReviewing = reviewMode !== 'none';
    return (
      <View style={[styles.caughtUpContainer, { backgroundColor: theme.card }]}>
        <View style={[styles.caughtUpIconCircle, { backgroundColor: theme.chip }]}>
          <Ionicons name="checkmark-circle-outline" size={56} color={theme.accent} />
        </View>
        <Text style={[styles.caughtUpTitle, { color: theme.text }]}>
          {isReviewing
            ? reviewMode === 'today' && todayCards.length === 0
              ? 'No stories today'
              : "You've reviewed these stories"
            : "You're all caught up!"}
        </Text>
        <Text style={[styles.caughtUpMessage, { color: theme.muted }]}>
          {isReviewing
            ? reviewMode === 'today' && todayCards.length === 0
              ? `There were no stories published today in ${filter === 'top' ? 'Top Stories' : filter === 'all' ? 'the feed' : CATEGORY_LABELS[filter]}.`
              : `You've reached the end of ${reviewMode === 'today' ? "today's" : 'past'} stories.`
            : filter === 'all'
              ? "You've read all the latest stories. Check back soon for fresh updates."
              : filter === 'top'
                ? "You've read all the top stories. Check back soon for fresh updates."
                : `You've read all stories in ${filter}. Check back soon for fresh updates.`}
        </Text>

        <View style={styles.caughtUpActions}>
          {unreadCards.length > 0 ? (
            <Pressable
              onPress={handleReadNewStories}
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
            style={[
              styles.caughtUpButton,
              { backgroundColor: theme.accent, opacity: isCheckingUpdates ? 0.7 : 1 },
            ]}
            accessibilityRole="button"
          >
            {isCheckingUpdates ? (
              <ActivityIndicator size="small" color={theme.accentText} style={styles.buttonIcon} />
            ) : (
              <Ionicons
                name="refresh"
                size={18}
                color={theme.accentText}
                style={styles.buttonIcon}
              />
            )}
            <Text style={[styles.caughtUpButtonText, { color: theme.accentText }]}>
              {isCheckingUpdates ? 'Checking for updates…' : 'Check for updates'}
            </Text>
          </Pressable>

          {inPager && displayCards.length > 0 ? (
            <Pressable
              onPress={() => pager.current?.setPage(0)}
              style={[styles.caughtUpButtonSecondary, { borderColor: theme.border }]}
              accessibilityRole="button"
            >
              <Ionicons name="arrow-up" size={18} color={theme.text} style={styles.buttonIcon} />
              <Text style={[styles.caughtUpButtonTextSecondary, { color: theme.text }]}>
                Back to top
              </Text>
            </Pressable>
          ) : null}

          {reviewMode !== 'today' && todayCards.length > 0 ? (
            <Pressable
              onPress={() => {
                setReviewMode('today');
                setPagerEpoch((e) => e + 1);
                indexRef.current = 0;
                setIndex(0);
              }}
              style={[styles.caughtUpButtonSecondary, { borderColor: theme.border }]}
              accessibilityRole="button"
            >
              <Ionicons
                name="today-outline"
                size={18}
                color={theme.text}
                style={styles.buttonIcon}
              />
              <Text style={[styles.caughtUpButtonTextSecondary, { color: theme.text }]}>
                Review today's stories ({todayCards.length})
              </Text>
            </Pressable>
          ) : null}

          {reviewMode !== 'all' && visible.length > todayCards.length ? (
            <Pressable
              onPress={() => {
                setReviewMode('all');
                setPagerEpoch((e) => e + 1);
                indexRef.current = 0;
                setIndex(0);
              }}
              style={[styles.caughtUpButtonSecondary, { borderColor: theme.border }]}
              accessibilityRole="button"
            >
              <Ionicons
                name="book-outline"
                size={18}
                color={theme.muted}
                style={styles.buttonIcon}
              />
              <Text style={[styles.caughtUpButtonTextSecondary, { color: theme.muted }]}>
                Review all past stories ({visible.length})
              </Text>
            </Pressable>
          ) : null}

          {isReviewing ? (
            <Pressable
              onPress={() => {
                setReviewMode('none');
                setPagerEpoch((e) => e + 1);
                indexRef.current = 0;
                setIndex(0);
              }}
              style={[styles.caughtUpButtonSecondary, { borderColor: theme.border }]}
              accessibilityRole="button"
            >
              <Ionicons
                name="close-circle-outline"
                size={18}
                color={theme.text}
                style={styles.buttonIcon}
              />
              <Text style={[styles.caughtUpButtonTextSecondary, { color: theme.text }]}>
                Back to caught up
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  };

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
  } else if (reviewMode === 'today' && todayCards.length === 0) {
    // Reviewing today, but this specific category has no stories published today
    body = renderCaughtUpCard(false);
  } else {
    body = (
      <View style={styles.pagerContainer} {...panResponder.panHandlers}>
        <PagerView
          key={`${filter}-${reviewMode}-${pagerEpoch}`}
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
                <NewsCard
                  card={card}
                  bookmarked={isBookmarked(card.id)}
                  onToggleBookmark={toggle}
                />
              ) : null}
            </View>
          ))}
          <View key="caught-up-end" style={styles.page} collapsable={false}>
            {Math.abs(displayCards.length - index) <= RENDER_WINDOW
              ? renderCaughtUpCard(true)
              : null}
          </View>
        </PagerView>
      </View>
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
            handleReadNewStories();
          }}
          testID="banner-new"
        />
      ) : null}
      <Toast message={toast?.message ?? null} icon={toast?.icon} onDismiss={() => setToast(null)} />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.pullIndicator,
          {
            height: pullAnim,
            opacity: pullAnim.interpolate({
              inputRange: [0, 15, 40],
              outputRange: [0, 0.6, 1],
              extrapolate: 'clamp',
            }),
            backgroundColor: theme.chip,
          },
        ]}
      >
        {isCheckingUpdates ? (
          <View style={styles.pullIndicatorContent}>
            <ActivityIndicator size="small" color={theme.accent} style={styles.pullIndicatorIcon} />
            <Text style={[styles.pullIndicatorText, { color: theme.text }]}>
              Checking for updates…
            </Text>
          </View>
        ) : (
          <View style={styles.pullIndicatorContent}>
            <Ionicons
              name={pullThresholdMet ? 'arrow-up' : 'arrow-down'}
              size={15}
              color={theme.accent}
              style={styles.pullIndicatorIcon}
            />
            <Text style={[styles.pullIndicatorText, { color: theme.text }]}>
              {pullThresholdMet ? 'Release to refresh' : 'Pull down to refresh'}
            </Text>
          </View>
        )}
      </Animated.View>
      {body}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pagerContainer: { flex: 1 },
  pullIndicator: {
    width: '100%',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pullIndicatorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  pullIndicatorIcon: {
    marginRight: 6,
  },
  pullIndicatorText: {
    fontSize: 13,
    fontWeight: '600',
  },
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
