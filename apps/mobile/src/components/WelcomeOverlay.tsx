import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTheme } from '@/lib/theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface WelcomeOverlayProps {
  onDismiss: () => void;
}

export function WelcomeOverlay({ onDismiss }: WelcomeOverlayProps) {
  const theme = useTheme();
  const panY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const bounceAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, {
          toValue: -6,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(bounceAnim, {
          toValue: 0,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bounceAnim]);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(panY, {
        toValue: -SCREEN_HEIGHT,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onDismiss();
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 5,
      onPanResponderMove: (_, gesture) => {
        // Only allow upward drag
        if (gesture.dy < 0) {
          panY.setValue(gesture.dy);
        }
      },
      onPanResponderRelease: (_, gesture) => {
        // Swiped up fast or dragged up > 60px
        if (gesture.dy < -60 || gesture.vy < -0.5) {
          dismiss();
        } else {
          // Snap back
          Animated.spring(panY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    }),
  ).current;

  return (
    <Animated.View
      style={[
        styles.backdrop,
        {
          opacity,
          transform: [{ translateY: panY }],
        },
      ]}
      {...panResponder.panHandlers}
    >
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.dark ? 'rgba(18, 19, 29, 0.94)' : 'rgba(255, 255, 255, 0.96)',
            borderColor: theme.dark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.1)',
          },
        ]}
      >
        <View style={styles.badge}>
          <View style={styles.badgeDot} />
          <Text style={styles.badgeText}>WELCOME TO AISHORT</Text>
        </View>

        <Text style={[styles.title, { color: theme.text }]}>
          AI news in <Text style={styles.highlight}>60 words</Text> or less.
        </Text>

        <Text style={[styles.subtitle, { color: theme.muted }]}>
          Skip the hype and long essays. Get concise, verified AI breakthroughs delivered every
          hour.
        </Text>

        <View style={styles.features}>
          <View
            style={[
              styles.featureRow,
              {
                backgroundColor: theme.dark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
                borderColor: theme.dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
              },
            ]}
          >
            <Text style={styles.featureIcon}>⏱️</Text>
            <View style={styles.featureTextWrap}>
              <Text style={[styles.featureTitle, { color: theme.text }]}>60 Words Max</Text>
              <Text style={[styles.featureDesc, { color: theme.muted }]}>
                Clear takeaways, zero fluff or filler
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.featureRow,
              {
                backgroundColor: theme.dark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
                borderColor: theme.dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
              },
            ]}
          >
            <Text style={styles.featureIcon}>🔄</Text>
            <View style={styles.featureTextWrap}>
              <Text style={[styles.featureTitle, { color: theme.text }]}>Updated Hourly</Text>
              <Text style={[styles.featureDesc, { color: theme.muted }]}>
                Models, research, products & funding
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.featureRow,
              {
                backgroundColor: theme.dark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
                borderColor: theme.dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
              },
            ]}
          >
            <Text style={styles.featureIcon}>👆</Text>
            <View style={styles.featureTextWrap}>
              <Text style={[styles.featureTitle, { color: theme.text }]}>Swipe to Flip</Text>
              <Text style={[styles.featureDesc, { color: theme.muted }]}>
                Swipe up for next story, tap to read source
              </Text>
            </View>
          </View>
        </View>

        <Pressable
          onPress={dismiss}
          style={({ pressed }) => [
            styles.btn,
            { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Start reading"
        >
          <Text style={styles.btnText}>Start Reading</Text>
          <Ionicons name="arrow-forward" size={17} color="#ffffff" />
        </Pressable>

        <Animated.View style={[styles.hintWrap, { transform: [{ translateY: bounceAnim }] }]}>
          <Ionicons name="arrow-up" size={14} color="#818cf8" />
          <Text style={[styles.hintText, { color: theme.muted }]}>or swipe up to begin</Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(9, 9, 14, 0.76)',
    zIndex: 100,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  card: {
    width: '100%',
    maxWidth: 390,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 12,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.35)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    gap: 6,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34d399',
  },
  badgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#a5b4fc',
    letterSpacing: 0.8,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 6,
    lineHeight: 26,
    letterSpacing: -0.3,
  },
  highlight: {
    color: '#818cf8',
  },
  subtitle: {
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 14,
    paddingHorizontal: 8,
  },
  features: {
    width: '100%',
    gap: 7,
    marginBottom: 14,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  featureIcon: {
    fontSize: 18,
  },
  featureTextWrap: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 16,
  },
  featureDesc: {
    fontSize: 11,
    lineHeight: 14,
    marginTop: 1,
  },
  btn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
    shadowColor: '#4f46e5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  btnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  hintWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  hintText: {
    fontSize: 11,
    fontWeight: '500',
  },
});
