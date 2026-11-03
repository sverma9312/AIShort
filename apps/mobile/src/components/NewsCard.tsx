import { generateCardPalette, type Card, type Category } from '@aishort/shared';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import type { ComponentProps } from 'react';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const insets = useSafeAreaInsets();
  const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);

  const palette = card.palette ?? generateCardPalette(card.category, card.imageUrl);
  const isDynamic = theme.isDynamic;

  const cardBackground = isDynamic ? (card.imageUrl ? '#0B0B0E' : palette.card) : theme.card;
  const accentColor = isDynamic ? palette.accent : theme.accent;
  const accentTextColor = isDynamic ? palette.accentText : theme.accentText;
  const chipBg = isDynamic ? (theme.dark ? palette.chip : '#EEF0FF') : theme.chip;
  const chipTextColor = isDynamic ? (theme.dark ? '#FFFFFF' : accentColor) : theme.accent;
  const cardBorderColor = isDynamic
    ? theme.dark
      ? 'rgba(255, 255, 255, 0.08)'
      : 'rgba(0, 0, 0, 0.06)'
    : theme.border;

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
    <View
      style={[styles.container, { backgroundColor: cardBackground }]}
      testID={`card-${card.id}`}
    >
      {isDynamic && card.imageUrl ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Image
            source={{ uri: card.imageUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            blurRadius={50}
            transition={200}
            accessibilityIgnoresInvertColors
            accessible={false}
          />
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: theme.dark
                  ? 'rgba(11, 11, 16, 0.82)'
                  : 'rgba(255, 255, 255, 0.85)',
              },
            ]}
          />
        </View>
      ) : null}

      {card.imageUrl ? (
        <Pressable
          onPress={() => setIsImageViewerOpen(true)}
          style={[
            styles.imageContainer,
            { backgroundColor: isDynamic ? 'transparent' : theme.card },
          ]}
          accessibilityRole="button"
          accessibilityLabel="View full image"
        >
          <Image
            source={{ uri: card.imageUrl }}
            style={styles.image}
            contentFit="contain"
            transition={200}
            accessibilityIgnoresInvertColors
            accessible={false}
          />
          <View style={styles.zoomHint}>
            <Ionicons name="scan-outline" size={14} color="#FFFFFF" />
          </View>
        </Pressable>
      ) : (
        <View
          style={[styles.noImageBanner, { backgroundColor: isDynamic ? palette.chip : theme.chip }]}
        >
          <View
            style={[
              styles.noImageIconCircle,
              { backgroundColor: isDynamic ? palette.card : theme.card },
            ]}
          >
            <Ionicons name={CATEGORY_ICONS[card.category]} size={36} color={accentColor} />
          </View>
          <Text style={[styles.noImageSource, { color: theme.muted }]}>
            {card.sourceName} · {CATEGORY_LABELS[card.category]}
          </Text>
        </View>
      )}

      {card.imageUrl ? (
        <Modal
          visible={isImageViewerOpen}
          transparent={true}
          animationType="fade"
          statusBarTranslucent={true}
          onRequestClose={() => setIsImageViewerOpen(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalHeader, { paddingTop: Math.max(insets.top, 44) + 8 }]}>
              <Text style={styles.modalTitle} numberOfLines={1}>
                {card.sourceName}
              </Text>
              <Pressable
                onPress={() => setIsImageViewerOpen(false)}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                style={styles.modalCloseButton}
                accessibilityRole="button"
                accessibilityLabel="Close image"
              >
                <Ionicons name="close" size={26} color="#FFFFFF" />
              </Pressable>
            </View>

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              maximumZoomScale={4}
              minimumZoomScale={1}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              centerContent
            >
              <Image
                source={{ uri: card.imageUrl }}
                style={styles.fullImage}
                contentFit="contain"
                transition={200}
                accessibilityIgnoresInvertColors
              />
            </ScrollView>

            <View style={[styles.modalFooter, { paddingBottom: Math.max(insets.bottom, 20) + 12 }]}>
              <Pressable
                onPress={() => setIsImageViewerOpen(false)}
                style={styles.modalClosePill}
                accessibilityRole="button"
                accessibilityLabel="Close image viewer"
              >
                <Ionicons
                  name="close-circle-outline"
                  size={18}
                  color="#FFFFFF"
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.modalClosePillText}>Close</Text>
              </Pressable>
              <Text style={styles.modalFooterHint}>Pinch to zoom • Tap Close to exit</Text>
            </View>
          </View>
        </Modal>
      ) : null}

      <ScrollView
        style={styles.bodyScroll}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.meta}>
          <Text style={[styles.chip, { backgroundColor: chipBg, color: chipTextColor }]}>
            {CATEGORY_LABELS[card.category]}
          </Text>
          <Text
            style={[
              styles.secondaryChip,
              {
                backgroundColor: isDynamic
                  ? theme.dark
                    ? 'rgba(255, 255, 255, 0.12)'
                    : 'rgba(0, 0, 0, 0.06)'
                  : theme.dark
                    ? '#22222E'
                    : '#EAEAEF',
                color: theme.text,
              },
            ]}
          >
            {card.sourceName}
          </Text>
          <Text
            style={[
              styles.secondaryChip,
              {
                backgroundColor: isDynamic
                  ? theme.dark
                    ? 'rgba(255, 255, 255, 0.08)'
                    : 'rgba(0, 0, 0, 0.04)'
                  : theme.dark
                    ? '#1A1A22'
                    : '#F2F2F6',
                color: theme.muted,
              },
            ]}
          >
            {relativeTime(card.publishedAt, now)}
          </Text>
          {card.importance >= 8 ? (
            <Text style={[styles.top, { color: accentColor }]}>Top story</Text>
          ) : null}
        </View>
        <Text style={[styles.headline, { color: theme.text }]} accessibilityRole="header">
          {card.headline}
        </Text>
        <Text style={[styles.summary, { color: theme.text }]}>{card.summary}</Text>
      </ScrollView>

      <View style={[styles.actions, { borderTopColor: cardBorderColor }]}>
        <Pressable
          onPress={readMore}
          style={[styles.readMore, { backgroundColor: accentColor }]}
          accessibilityRole="link"
          accessibilityLabel={`Read more at ${card.sourceName}`}
          testID="read-more"
        >
          <Text style={[styles.readMoreText, { color: accentTextColor }]}>
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
            color={bookmarked ? accentColor : theme.text}
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
  zoomHint: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: 6,
    borderRadius: 8,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: '#000000',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    zIndex: 10,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
    letterSpacing: 0.3,
  },
  modalCloseButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    width: '100%',
    height: '100%',
  },
  modalFooter: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  modalClosePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  modalClosePillText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  modalFooterHint: {
    color: '#8E8E93',
    fontSize: 12,
    textAlign: 'center',
  },
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
  bodyScroll: { flex: 1 },
  bodyContent: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 16, gap: 10 },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  chip: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  secondaryChip: {
    fontSize: 12,
    fontWeight: '500',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  top: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: 2,
  },
  headline: { fontSize: 21, lineHeight: 27, fontWeight: '700' },
  summary: { fontSize: 15, lineHeight: 23 },
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
