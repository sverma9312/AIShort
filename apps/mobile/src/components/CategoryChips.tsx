import type { Category } from '@aishort/shared';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { CATEGORY_LABELS } from '@/lib/categories';
import { useTheme } from '@/lib/theme';

export type CategoryFilter = Category | 'all' | 'top';

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
  const options: { value: CategoryFilter; label: string; isTop?: boolean }[] = [
    { value: 'all', label: 'All' },
    ...categories.map((c) => ({ value: c, label: CATEGORY_LABELS[c] })),
    { value: 'top', label: '★ Top Story', isTop: true },
  ];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {options.map(({ value, label, isTop }) => {
        const active = value === selected;
        let chipBg = active ? theme.accent : theme.chip;
        let textColor = active ? theme.accentText : theme.text;
        let borderStyle = {};

        if (isTop) {
          if (active) {
            chipBg = '#F59E0B';
            textColor = '#FFFFFF';
            borderStyle = { borderWidth: 1, borderColor: '#F59E0B' };
          } else {
            chipBg = theme.dark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.10)';
            textColor = theme.dark ? '#FCD34D' : '#D97706';
            borderStyle = { borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.40)' };
          }
        }

        return (
          <Pressable
            key={value}
            onPress={() => onSelect(value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            testID={`filter-${value}`}
            style={[styles.chip, { backgroundColor: chipBg }, borderStyle]}
          >
            <Text style={[styles.label, { color: textColor }]}>{label}</Text>
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
