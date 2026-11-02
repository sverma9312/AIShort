import type { Card, Category } from '@aishort/shared';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import type { ComponentProps } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { CATEGORY_LABELS } from '@/lib/categories';
import { track } from '@/lib/telemetry';
import { useTheme } from '@/lib/theme';
import { relativeTime } from '@/lib/time';

const CATEGORY_ICONS: Record<Category, ComponentProps<typeof Ionicons>['name']> = {
  models: 'hardware-chip-outline',
  research: 'flask-outline',
  products: 'cube-outline',
  business: 'trending-up-outline',
  policy: 'shield-checkmark-outline',
  'open-source': 'git-branch-outline',
};

export interface NewsCardProps {
  card: Card;
  bookmarked: boolean;
  onToggleBookmark: (card: Card) => void;
  now?: Date;
}

export function NewsCard({ card, bookmarked, onToggleBookmark, now }: NewsCardProps) {
  const theme = useTheme();

  const readMore = () => {
    track('card_read_more', { category: card.category });
    void WebBrowser.openBrowserAsync(card.sourceUrl);
  };
  const share = () => {
    track('card_shared', { category: card.category });
    void Share.share({ message: `${card.headline}\n\n${card.sourceUrl}`, url: card.sourceUrl });
  };
  const bookmark = () => {
    if (!bookmarked) track('bookmark_added', { category: card.category });
    onToggleBookmark(card);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.card }]} testID={`card-${card.id}`}>
      {card.imageUrl ? (
        <View style={[styles.imageContainer, { backgroundColor: theme.card }]}>
          <Image
            source={{ uri: card.imageUrl }}
            style={styles.image}
            contentFit="contain"
            transition={200}
            accessibilityIgnoresInvertColors
            accessible={false}
          />
        </View>
      ) : (
        <View style={[styles.noImageBanner, { backgroundColor: theme.chip }]}>
          <View style={[styles.noImageIconCircle, { backgroundColor: theme.card }]}>
            <Ionicons name={CATEGORY_ICONS[card.category]} size={36} color={theme.accent} />
          </View>
          <Text style={[styles.noImageSource, { color: theme.muted }]}>
            {card.sourceName} · {CATEGORY_LABELS[card.category]}
          </Text>
        </View>
      )}

      <View style={styles.body}>
        <View style={styles.meta}>
          <Text style={[styles.chip, { backgroundColor: theme.chip, color: theme.accent }]}>
            {CATEGORY_LABELS[card.category]}
          </Text>
          {card.importance >= 8 ? (
            <Text style={[styles.top, { color: theme.accent }]}>Top story</Text>
          ) : null}
        </View>
        <Text style={[styles.headline, { color: theme.text }]} accessibilityRole="header">
          {card.headline}
        </Text>
        <Text style={[styles.summary, { color: theme.text }]}>{card.summary}</Text>
        <Text style={[styles.source, { color: theme.muted }]}>
          {card.sourceName} · {relativeTime(card.publishedAt, now)}
        </Text>
      </View>

      <View style={[styles.actions, { borderTopColor: theme.border }]}>
        <Pressable
          onPress={readMore}
          style={[styles.readMore, { backgroundColor: theme.accent }]}
          accessibilityRole="link"
          accessibilityLabel={`Read more at ${card.sourceName}`}
          testID="read-more"
        >
          <Text style={[styles.readMoreText, { color: theme.accentText }]}>
            Read more at {card.sourceName}
          </Text>
        </Pressable>
        <Pressable
          onPress={share}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Share"
          testID="share"
        >
          <Ionicons name="share-outline" size={24} color={theme.text} />
        </Pressable>
        <Pressable
          onPress={bookmark}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={bookmarked ? 'Remove bookmark' : 'Bookmark'}
          accessibilityState={{ selected: bookmarked }}
          testID="bookmark"
        >
          <Ionicons
            name={bookmarked ? 'bookmark' : 'bookmark-outline'}
            size={24}
            color={bookmarked ? theme.accent : theme.text}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  imageContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    maxHeight: '34%',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  noImageBanner: {
    width: '100%',
    height: '22%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  noImageIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noImageSource: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 16, gap: 10 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chip: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  top: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  headline: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  summary: { fontSize: 16, lineHeight: 24 },
  source: { fontSize: 13 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  readMore: { flex: 1, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10 },
  readMoreText: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
});
