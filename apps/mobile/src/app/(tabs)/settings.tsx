import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FeedbackModal } from '@/components/FeedbackModal';
import { ALL_CATEGORIES, CATEGORY_LABELS } from '@/lib/categories';
import { config } from '@/lib/config';
import { useFeed } from '@/lib/feed';
import {
  isPushAvailable,
  registerForPushNotifications,
  unregisterFromPushNotifications,
} from '@/lib/push';
import { useReadHistory } from '@/lib/readHistory';
import { useSettings, type Settings } from '@/lib/settings';
import { track } from '@/lib/telemetry';
import { useTheme } from '@/lib/theme';
import { relativeTime } from '@/lib/time';

const THEMES: { value: Settings['theme']; label: string }[] = [
  { value: 'dynamic', label: 'Dynamic' },
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function Row({
  label,
  children,
  borderBottomColor,
  textColor,
  testID,
}: {
  label: string;
  children: ReactNode;
  borderBottomColor: string;
  textColor: string;
  testID?: string;
}) {
  return (
    <View style={[styles.row, { borderBottomColor }]} testID={testID}>
      <Text style={[styles.label, { color: textColor }]}>{label}</Text>
      {children}
    </View>
  );
}

function Section({
  title,
  children,
  mutedColor,
  cardColor,
}: {
  title: string;
  children: ReactNode;
  mutedColor: string;
  cardColor: string;
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: mutedColor }]}>{title}</Text>
      <View style={[styles.card, { backgroundColor: cardColor }]}>{children}</View>
    </View>
  );
}

function Link({
  label,
  url,
  borderBottomColor,
  accentColor,
}: {
  label: string;
  url: string;
  borderBottomColor: string;
  accentColor: string;
}) {
  return (
    <Pressable
      onPress={() => void WebBrowser.openBrowserAsync(url)}
      accessibilityRole="link"
      style={[styles.row, { borderBottomColor }]}
    >
      <Text style={[styles.label, { color: accentColor }]}>{label}</Text>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const theme = useTheme();
  const { settings, update, toggleCategory } = useSettings();
  const { resetReadHistory } = useReadHistory();
  const { checkedAt } = useFeed();
  const [feedbackVisible, setFeedbackVisible] = useState(false);

  const setNotifications = async (on: boolean) => {
    if (!on) {
      update({ notifications: false });
      await unregisterFromPushNotifications();
      return;
    }
    const result = await registerForPushNotifications();
    update({ notifications: result.status === 'registered' });
    if (result.status === 'registered') track('notifications_enabled');
    else if (result.status === 'denied')
      Alert.alert(
        'Notifications are off',
        'Allow notifications for this app in your device settings.',
      );
    else if (result.status !== 'error')
      Alert.alert('Not available', 'Notifications are not available in this build.');
    else Alert.alert('Something went wrong', 'Please try again later.');
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
    >
      <Section title="APPEARANCE" mutedColor={theme.muted} cardColor={theme.card}>
        <View style={styles.segmented}>
          {THEMES.map(({ value, label }) => {
            const active = settings.theme === value;
            return (
              <Pressable
                key={value}
                onPress={() => update({ theme: value })}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                testID={`theme-${value}`}
                style={[styles.segment, { backgroundColor: active ? theme.accent : theme.chip }]}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    color: active ? theme.accentText : theme.text,
                    fontWeight: '600',
                    fontSize: 13,
                  }}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section title="CATEGORIES IN YOUR FEED" mutedColor={theme.muted} cardColor={theme.card}>
        {ALL_CATEGORIES.map((category) => (
          <Row
            key={`row-cat-${category}`}
            label={CATEGORY_LABELS[category]}
            borderBottomColor={theme.border}
            textColor={theme.text}
          >
            <Switch
              key={`category-switch-${category}`}
              value={settings.categories.includes(category)}
              onValueChange={(val) => toggleCategory(category, val)}
              trackColor={{ false: theme.border, true: theme.accent }}
              accessibilityLabel={`Show ${CATEGORY_LABELS[category]}`}
              testID={`category-${category}`}
            />
          </Row>
        ))}
      </Section>

      <Section title="NOTIFICATIONS" mutedColor={theme.muted} cardColor={theme.card}>
        <Row
          label="Top stories (max 2 a day)"
          borderBottomColor={theme.border}
          textColor={theme.text}
        >
          <Switch
            key="notifications-switch"
            value={settings.notifications === true}
            onValueChange={(on) => void setNotifications(on)}
            trackColor={{ false: theme.border, true: theme.accent }}
            disabled={!isPushAvailable()}
            accessibilityLabel="Top story notifications"
            testID="notifications"
          />
        </Row>
      </Section>

      <Section title="PRIVACY" mutedColor={theme.muted} cardColor={theme.card}>
        <Row
          label="Analytics & crash reports"
          borderBottomColor={theme.border}
          textColor={theme.text}
        >
          <Switch
            key="analytics-switch"
            value={settings.analytics}
            onValueChange={(on) => update({ analytics: on })}
            trackColor={{ false: theme.border, true: theme.accent }}
            accessibilityLabel="Analytics and crash reports"
            testID="analytics"
          />
        </Row>
        <Row
          label="Clear read history"
          borderBottomColor={theme.border}
          textColor={theme.text}
        >
          <Pressable
            onPress={() => {
              Alert.alert(
                'Reset reading history?',
                'This will mark all stories as unread so you can read through them again.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Reset',
                    style: 'destructive',
                    onPress: () => {
                      resetReadHistory();
                      Alert.alert('Reset complete', 'All stories have been marked as unread.');
                    },
                  },
                ],
              );
            }}
            accessibilityRole="button"
            accessibilityLabel="Clear read history"
          >
            <Text style={{ color: theme.accent, fontWeight: '600', fontSize: 15 }}>Reset</Text>
          </Pressable>
        </Row>
        <Link
          label="Privacy policy"
          url={config.privacyUrl}
          borderBottomColor={theme.border}
          accentColor={theme.accent}
        />
        <Pressable
          onPress={() => setFeedbackVisible(true)}
          style={[styles.row, { borderBottomColor: theme.border }]}
          accessibilityRole="button"
          accessibilityLabel="Support & feedback"
        >
          <Text style={[styles.label, { color: theme.accent }]}>Support & feedback</Text>
          <Ionicons name="chatbubble-ellipses-outline" size={18} color={theme.accent} />
        </Pressable>
      </Section>

      <Text style={[styles.footer, { color: theme.muted }]}>
        Version {Constants.expoConfig?.version ?? '?'}
        {checkedAt ? ` · Feed checked ${relativeTime(checkedAt)}` : ''}
        {'\n'}Summaries are written by AI from the linked articles and may contain mistakes.
      </Text>

      <FeedbackModal
        visible={feedbackVisible}
        onClose={() => setFeedbackVisible(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 20 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5, marginLeft: 4 },
  card: { borderRadius: 12, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  label: { fontSize: 16 },
  segmented: { flexDirection: 'row', gap: 6, padding: 8 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8 },
  footer: { fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 8 },
});
