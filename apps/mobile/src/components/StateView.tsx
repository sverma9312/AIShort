import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/lib/theme';

/** Full-screen loading, empty and error states. */
export function StateView({
  kind,
  title,
  message,
  actionLabel,
  onAction,
}: {
  kind: 'loading' | 'empty' | 'error';
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.container} testID={`state-${kind}`}>
      {kind === 'loading' ? <ActivityIndicator size="large" color={theme.accent} /> : null}
      {title ? <Text style={[styles.title, { color: theme.text }]}>{title}</Text> : null}
      {message ? <Text style={[styles.message, { color: theme.muted }]}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          style={[styles.button, { backgroundColor: theme.accent }]}
          accessibilityRole="button"
        >
          <Text style={[styles.buttonText, { color: theme.accentText }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  title: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  message: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  button: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  buttonText: { fontSize: 15, fontWeight: '600' },
});
