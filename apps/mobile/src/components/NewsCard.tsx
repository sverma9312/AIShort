import type { Card } from '@aishort/shared';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { CATEGORY_LABELS } from '@/lib/categories';
import { track } from '@/lib/telemetry';
import { useTheme } from '@/lib/theme';
import { relativeTime } from '@/lib/time';

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
        <Image
          source={{ uri: card.imageUrl }}
          style={styles.image}
          contentFit="cover"
          transition={200}
          accessibilityIgnoresInvertColors
          accessible={false}
        />
      ) : (
        <View style={[styles.image, styles.placeholder, { backgroundColor: theme.chip }]}>
          <Text style={[styles.placeholderText, { color: theme.accent }]}>
            {CATEGORY_LABELS[card.category]}
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
  image: { width: '100%', height: '38%' },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  placeholderText: { fontSize: 28, fontWeight: '700' },
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
