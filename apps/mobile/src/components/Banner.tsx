import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '@/lib/theme';

export function Banner({
  text,
  onPress,
  testID,
}: {
  text: string;
  onPress?: () => void;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      testID={testID}
      style={[styles.banner, { backgroundColor: theme.chip }]}
    >
      <Text style={[styles.text, { color: theme.text }]}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: { paddingHorizontal: 16, paddingVertical: 8 },
  text: { fontSize: 13, textAlign: 'center' },
});
