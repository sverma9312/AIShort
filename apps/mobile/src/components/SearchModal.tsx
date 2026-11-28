import type { Category } from '@aishort/shared';
import type { Card } from '@aishort/shared';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CATEGORY_LABELS } from '@/lib/categories';
import { useTheme } from '@/lib/theme';
import { relativeTime } from '@/lib/time';

const CATEGORY_ICON_MAP: Record<Category, keyof typeof Ionicons.glyphMap> = {
  models: 'cube-outline',
  research: 'flask-outline',
  products: 'apps-outline',
  business: 'briefcase-outline',
  policy: 'shield-checkmark-outline',
  'open-source': 'git-branch-outline',
};

const SUGGESTED_CHIPS = [
  'OpenAI',
  'Google',
  'Nvidia',
  'Robotics',
  'ChatGPT',
  'Anthropic',
  'Apple',
  'Bitcoin',
];

interface SearchModalProps {
  visible: boolean;
  onClose: () => void;
  cards: readonly Card[];
  onSelectCard: (card: Card) => void;
}

function HighlightedText({
  text,
  query,
  textColor,
  accentColor,
}: {
  text: string;
  query: string;
  textColor: string;
  accentColor: string;
}) {
  const trimmed = query.trim();
  if (!trimmed) {
    return (
      <Text style={[styles.resultHeadline, { color: textColor }]} numberOfLines={2}>
        {text}
      </Text>
    );
  }

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const patterns = tokens.flatMap((t) => {
    const list = [t];
    if (t.endsWith('ics') && t.length > 4) list.push(t.slice(0, -3));
    if (t.endsWith('ing') && t.length > 5) list.push(t.slice(0, -3));
    if (t.endsWith('s') && t.length > 3) list.push(t.slice(0, -1));
    return list;
  });

  const escaped = patterns.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));

  return (
    <Text style={[styles.resultHeadline, { color: textColor }]} numberOfLines={2}>
      {parts.map((part, index) => {
        const isMatch = patterns.some((p) => part.toLowerCase() === p.toLowerCase());
        if (isMatch) {
          return (
            <Text
              key={index}
              style={[
                styles.highlight,
                {
                  color: '#22d3ee',
                  backgroundColor: 'rgba(34, 211, 238, 0.22)',
                },
              ]}
            >
              {part}
            </Text>
          );
        }
        return <Text key={index}>{part}</Text>;
      })}
    </Text>
  );
}

export function SearchModal({ visible, onClose, cards, onSelectCard }: SearchModalProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  const handleClose = () => {
    setQuery('');
    onClose();
  };

  const filteredCards = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const tokens = q.split(/\s+/).filter(Boolean);
    const stems = tokens.map((t) => {
      if (t.endsWith('ics') && t.length > 4) return t.slice(0, -3); // robotics -> robot
      if (t.endsWith('ing') && t.length > 5) return t.slice(0, -3); // hacking -> hack
      if (t.endsWith('es') && t.length > 4) return t.slice(0, -2);
      if (t.endsWith('s') && t.length > 3) return t.slice(0, -1);
      return t;
    });

    return cards.filter((card) => {
      const fullText =
        `${card.headline} ${card.summary} ${card.sourceName} ${card.category}`.toLowerCase();
      return (
        fullText.includes(q) ||
        tokens.every((t, i) => {
          const stem = stems[i];
          return fullText.includes(t) || (stem ? fullText.includes(stem) : false);
        })
      );
    });
  }, [cards, query]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.container, { backgroundColor: theme.background }]}
      >
        {/* Top Search Bar Row */}
        <View
          style={[
            styles.header,
            {
              paddingTop: Math.max(insets.top, 14),
              borderBottomColor: theme.border,
            },
          ]}
        >
          <Pressable
            onPress={handleClose}
            hitSlop={12}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Back to feed"
            testID="search-back-button"
          >
            <Ionicons name="chevron-back" size={26} color={theme.text} />
          </Pressable>

          <View
            style={[
              styles.inputWrapper,
              {
                backgroundColor: theme.card,
                borderColor: '#22d3ee',
              },
            ]}
          >
            <Ionicons name="search" size={18} color="#22d3ee" style={styles.searchIcon} />
            <TextInput
              testID="search-input"
              style={[styles.input, { color: theme.text }]}
              placeholder="Search stories, topics, companies..."
              placeholderTextColor={theme.muted}
              value={query}
              onChangeText={setQuery}
              autoFocus
              returnKeyType="search"
              clearButtonMode="never"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {query.length > 0 ? (
              <Pressable
                onPress={() => setQuery('')}
                hitSlop={10}
                style={styles.clearButton}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                testID="search-clear-button"
              >
                <Ionicons name="close-circle" size={19} color={theme.muted} />
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Subtitle */}
        <Text style={[styles.subtitle, { color: theme.muted }]}>
          Searching the latest 100 stories
        </Text>

        {/* Suggested Topic Chips */}
        <View style={styles.chipsRowContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsScroll}
            keyboardShouldPersistTaps="handled"
          >
            {SUGGESTED_CHIPS.map((chip) => {
              const active = query.toLowerCase() === chip.toLowerCase();
              return (
                <Pressable
                  key={chip}
                  onPress={() => setQuery(chip)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? 'rgba(34, 211, 238, 0.15)' : theme.chip,
                      borderColor: active ? '#22d3ee' : theme.border,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Search ${chip}`}
                >
                  <Text style={[styles.chipText, { color: active ? '#22d3ee' : theme.text }]}>
                    {chip}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Results Counter if query present */}
        {query.trim().length > 0 ? (
          <View style={styles.countRow}>
            <Text style={[styles.countText, { color: '#22d3ee' }]}>
              {filteredCards.length} {filteredCards.length === 1 ? 'result' : 'results'}
            </Text>
          </View>
        ) : null}

        {/* Results / Empty View */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, 24) + 20 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {query.trim().length > 0 && filteredCards.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={[styles.emptyIconCircle, { backgroundColor: `${theme.accent}15` }]}>
                <Ionicons name="search-outline" size={40} color={theme.muted} />
              </View>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No stories found</Text>
              <Text style={[styles.emptySubtitle, { color: theme.muted }]}>
                We couldn&apos;t find &ldquo;{query}&rdquo; in today&apos;s latest 100 stories. Try
                broader keywords like OpenAI, model, or chips.
              </Text>
            </View>
          ) : (
            filteredCards.map((card) => {
              const icon = CATEGORY_ICON_MAP[card.category] ?? 'newspaper-outline';
              return (
                <Pressable
                  key={card.id}
                  onPress={() => {
                    onSelectCard(card);
                    handleClose();
                  }}
                  style={({ pressed }) => [
                    styles.cardRow,
                    {
                      borderBottomColor: theme.border,
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={card.headline}
                  testID={`search-result-${card.id}`}
                >
                  {/* Thumbnail / Category Icon */}
                  <View style={[styles.thumbnailContainer, { backgroundColor: theme.chip }]}>
                    {card.imageUrl ? (
                      <Image
                        source={{ uri: card.imageUrl }}
                        style={styles.thumbnail}
                        resizeMode="cover"
                      />
                    ) : (
                      <Ionicons
                        name={icon as keyof typeof Ionicons.glyphMap}
                        size={22}
                        color={theme.accent}
                      />
                    )}
                  </View>

                  {/* Story Info */}
                  <View style={styles.cardInfo}>
                    <HighlightedText
                      text={card.headline}
                      query={query}
                      textColor={theme.text}
                      accentColor={theme.accent}
                    />
                    <Text style={[styles.metaText, { color: theme.muted }]}>
                      {card.sourceName} · {relativeTime(card.publishedAt)}
                    </Text>
                  </View>
                </Pressable>
              );
            })
          )}

          {/* Bottom Disclaimer Notice (Matching Mockup) */}
          <View
            style={[styles.noticeCard, { backgroundColor: theme.card, borderColor: theme.border }]}
          >
            <Text style={[styles.noticeText, { color: theme.muted }]}>
              Not finding it? Only the latest 100 stories are kept, so older news may be gone. Try{' '}
              <Text
                onPress={() => setQuery('OpenAI')}
                style={[styles.noticeLink, { color: '#22d3ee' }]}
              >
                OpenAI
              </Text>{' '}
              or{' '}
              <Text
                onPress={() => setQuery('security')}
                style={[styles.noticeLink, { color: '#22d3ee' }]}
              >
                security
              </Text>
              .
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 8,
  },
  backButton: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputWrapper: {
    flex: 1,
    height: 46,
    borderRadius: 23,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  searchIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
  },
  clearButton: {
    padding: 4,
    marginLeft: 6,
  },
  subtitle: {
    fontSize: 13,
    paddingHorizontal: 18,
    marginTop: 6,
    marginBottom: 8,
  },
  chipsRowContainer: {
    marginBottom: 4,
  },
  chipsScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  countRow: {
    paddingHorizontal: 18,
    marginTop: 14,
    marginBottom: 6,
  },
  countText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  thumbnailContainer: {
    width: 58,
    height: 58,
    borderRadius: 10,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  cardInfo: {
    flex: 1,
  },
  resultHeadline: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  highlight: {
    fontWeight: '700',
    borderRadius: 3,
  },
  metaText: {
    fontSize: 12,
    marginTop: 4,
  },
  noticeCard: {
    marginTop: 24,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
  },
  noticeText: {
    fontSize: 13,
    lineHeight: 19,
  },
  noticeLink: {
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 20,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 300,
  },
});
