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
            backgroundColor: theme.dark ? '#12131C' : '#FFFFFF',
            borderColor: theme.dark ? 'rgba(255, 255, 255, 0.11)' : 'rgba(0, 0, 0, 0.09)',
          },
        ]}
      >
        <View
          style={[
            styles.badge,
            {
              backgroundColor: theme.dark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
              borderColor: theme.dark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
            },
          ]}
        >
          <Ionicons name="newspaper-outline" size={12} color={theme.dark ? '#94A3B8' : '#64748B'} />
          <Text style={[styles.badgeText, { color: theme.dark ? '#CBD5E1' : '#475569' }]}>
            AISHORT INTRO
          </Text>
        </View>

        <Text style={[styles.title, { color: theme.text }]}>
          AI news, distilled.{'\n'}
          <Text style={[styles.highlight, { color: theme.dark ? '#E2E8F0' : '#334155' }]}>
            In 60 words or less.
          </Text>
        </Text>

        <Text style={[styles.subtitle, { color: theme.muted }]}>
          Skip long essays and promotional noise. Verified breakthroughs briefed every hour.
        </Text>

        <View style={styles.features}>
          <View
            style={[
              styles.featureRow,
              {
                backgroundColor: theme.dark ? 'rgba(255, 255, 255, 0.032)' : 'rgba(0, 0, 0, 0.025)',
                borderColor: theme.dark ? 'rgba(255, 255, 255, 0.065)' : 'rgba(0, 0, 0, 0.06)',
              },
            ]}
          >
            <View
              style={[
                styles.featureIconBox,
                {
                  backgroundColor: theme.dark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
                  borderColor: theme.dark ? 'rgba(255, 255, 255, 0.09)' : 'rgba(0, 0, 0, 0.08)',
                },
              ]}
            >
              <Ionicons name="flash-outline" size={15} color={theme.dark ? '#E2E8F0' : '#1E293B'} />
            </View>
            <View style={styles.featureTextWrap}>
              <Text style={[styles.featureTitle, { color: theme.text }]}>60-Word Briefs</Text>
              <Text style={[styles.featureDesc, { color: theme.muted }]}>
                Every story stripped to its core takeaways
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.featureRow,
              {
                backgroundColor: theme.dark ? 'rgba(255, 255, 255, 0.032)' : 'rgba(0, 0, 0, 0.025)',
                borderColor: theme.dark ? 'rgba(255, 255, 255, 0.065)' : 'rgba(0, 0, 0, 0.06)',
              },
            ]}
          >
            <View
              style={[
                styles.featureIconBox,
                {
                  backgroundColor: theme.dark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
                  borderColor: theme.dark ? 'rgba(255, 255, 255, 0.09)' : 'rgba(0, 0, 0, 0.08)',
                },
              ]}
            >
              <Ionicons name="time-outline" size={15} color={theme.dark ? '#E2E8F0' : '#1E293B'} />
            </View>
            <View style={styles.featureTextWrap}>
              <Text style={[styles.featureTitle, { color: theme.text }]}>Hourly Updates</Text>
              <Text style={[styles.featureDesc, { color: theme.muted }]}>
                Frontier models, papers, releases & funding
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.featureRow,
              {
                backgroundColor: theme.dark ? 'rgba(255, 255, 255, 0.032)' : 'rgba(0, 0, 0, 0.025)',
                borderColor: theme.dark ? 'rgba(255, 255, 255, 0.065)' : 'rgba(0, 0, 0, 0.06)',
              },
            ]}
          >
            <View
              style={[
                styles.featureIconBox,
                {
                  backgroundColor: theme.dark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
                  borderColor: theme.dark ? 'rgba(255, 255, 255, 0.09)' : 'rgba(0, 0, 0, 0.08)',
                },
              ]}
            >
              <Ionicons
                name="chevron-up-outline"
                size={15}
                color={theme.dark ? '#E2E8F0' : '#1E293B'}
              />
            </View>
            <View style={styles.featureTextWrap}>
              <Text style={[styles.featureTitle, { color: theme.text }]}>Vertical Swipe</Text>
              <Text style={[styles.featureDesc, { color: theme.muted }]}>
                Swipe up for next story · Tap to view source
              </Text>
            </View>
          </View>
        </View>

        <Pressable
          onPress={dismiss}
          style={({ pressed }) => [
            styles.btn,
            {
              backgroundColor: theme.dark ? '#FFFFFF' : '#0F172A',
              opacity: pressed ? 0.9 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Start reading"
        >
          <Text style={[styles.btnText, { color: theme.dark ? '#0A0B10' : '#FFFFFF' }]}>
            Start Reading
          </Text>
          <Ionicons name="arrow-forward" size={16} color={theme.dark ? '#0A0B10' : '#FFFFFF'} />
        </Pressable>

        <Animated.View style={[styles.hintWrap, { transform: [{ translateY: bounceAnim }] }]}>
          <Ionicons name="arrow-up" size={13} color={theme.dark ? '#94A3B8' : '#64748B'} />
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
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4.5,
    gap: 6,
  },
  badgeText: {
    fontSize: 10.5,
    fontWeight: '700',
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
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
    paddingHorizontal: 6,
  },
  features: {
    width: '100%',
    gap: 8,
    marginBottom: 18,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 13,
    borderWidth: 1,
    gap: 12,
  },
  featureIconBox: {
    width: 32,
    height: 32,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    paddingVertical: 13,
    borderRadius: 12,
    gap: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 4,
  },
  btnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  hintWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
  },
  hintText: {
    fontSize: 11,
    fontWeight: '500',
  },
});
