import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { StateView } from '@/components/StateView';
import { useBookmarks } from '@/lib/bookmarks';
import { CATEGORY_LABELS } from '@/lib/categories';
import { useTheme } from '@/lib/theme';
import { relativeTime } from '@/lib/time';

export default function BookmarksScreen() {
  const theme = useTheme();
  const { bookmarks, remove } = useBookmarks();

  if (!bookmarks.length) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <StateView
          kind="empty"
          title="No saved stories"
          message="Tap the bookmark on any card to read it later."
        />
      </View>
    );
  }
  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <FlatList
        data={bookmarks}
        keyExtractor={(card) => card.id}
        style={[styles.container, { backgroundColor: theme.background }]}
        contentContainerStyle={[styles.list, { backgroundColor: theme.background }]}
        ItemSeparatorComponent={() => (
          <View style={[styles.separator, { backgroundColor: theme.border }]} />
        )}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/card/${item.id}`)}
            style={[styles.row, { backgroundColor: theme.card }]}
            accessibilityRole="button"
            testID={`saved-${item.id}`}
          >
            <View style={styles.text}>
              <Text style={[styles.headline, { color: theme.text }]} numberOfLines={2}>
                {item.headline}
              </Text>
              <Text style={[styles.meta, { color: theme.muted }]}>
                {CATEGORY_LABELS[item.category]} · {item.sourceName} ·{' '}
                {relativeTime(item.publishedAt)}
              </Text>
            </View>
            <Pressable
              onPress={() => remove(item.id)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Remove bookmark"
            >
              <Ionicons name="trash-outline" size={20} color={theme.muted} />
            </Pressable>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingVertical: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  text: { flex: 1, gap: 4 },
  headline: { fontSize: 16, fontWeight: '600', lineHeight: 22 },
  meta: { fontSize: 13 },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
});
