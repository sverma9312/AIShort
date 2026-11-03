import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useTheme } from '@/lib/theme';

export interface ToastProps {
  message: string | null;
  icon?: ComponentProps<typeof Ionicons>['name'];
  durationMs?: number;
  position?: 'top' | 'bottom';
  bottomOffset?: number;
  onDismiss: () => void;
  testID?: string;
}

export function Toast({
  message,
  icon = 'checkmark-circle',
  durationMs = 2200,
  position = 'bottom',
  bottomOffset = 24,
  onDismiss,
  testID = 'toast',
}: ToastProps) {
  const theme = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const startTranslate = position === 'top' ? -10 : 10;
  const translateY = useRef(new Animated.Value(startTranslate)).current;

  useEffect(() => {
    if (!message) return;

    // Reset and animate in
    opacity.setValue(0);
    translateY.setValue(startTranslate);

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto-dismiss after duration
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: startTranslate,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        onDismiss();
      });
    }, durationMs);

    return () => clearTimeout(timer);
  }, [message, durationMs, onDismiss, opacity, translateY, startTranslate]);

  if (!message) return null;

  return (
    <Animated.View
      pointerEvents="none"
      testID={testID}
      style={[
        styles.container,
        position === 'top' ? { top: 56 } : { bottom: bottomOffset },
        {
          opacity,
          transform: [{ translateY }],
          backgroundColor: theme.dark ? 'rgba(28, 28, 40, 0.96)' : 'rgba(255, 255, 255, 0.96)',
          borderColor: theme.dark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
          shadowColor: '#000000',
        },
      ]}
    >
      {icon ? <Ionicons name={icon} size={18} color={theme.accent} style={styles.icon} /> : null}
      <Text style={[styles.text, { color: theme.text }]}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    zIndex: 9999,
    elevation: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
  },
  icon: {
    marginRight: 8,
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
