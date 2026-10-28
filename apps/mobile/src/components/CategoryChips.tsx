import type { Category } from '@aishort/shared';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { CATEGORY_LABELS } from '@/lib/categories';
import { useTheme } from '@/lib/theme';

export type CategoryFilter = Category | 'all';

export function CategoryChips({
  categories,
  selected,
  onSelect,
}: {
  categories: readonly Category[];
  selected: CategoryFilter;
  onSelect: (filter: CategoryFilter) => void;
}) {
  const theme = useTheme();
  const options: { value: CategoryFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    ...categories.map((c) => ({ value: c, label: CATEGORY_LABELS[c] })),
  ];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {options.map(({ value, label }) => {
        const active = value === selected;
        return (
          <Pressable
            key={value}
            onPress={() => onSelect(value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            testID={`filter-${value}`}
            style={[styles.chip, { backgroundColor: active ? theme.accent : theme.chip }]}
          >
            <Text style={[styles.label, { color: active ? theme.accentText : theme.text }]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999 },
  label: { fontSize: 14, fontWeight: '600' },
});
