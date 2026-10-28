import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import type { ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { ALL_CATEGORIES, CATEGORY_LABELS } from '@/lib/categories';
import { config } from '@/lib/config';
import { useFeed } from '@/lib/feed';
import {
  isPushAvailable,
  registerForPushNotifications,
  unregisterFromPushNotifications,
} from '@/lib/push';
import { useSettings, type Settings } from '@/lib/settings';
import { track } from '@/lib/telemetry';
import { useTheme } from '@/lib/theme';
import { relativeTime } from '@/lib/time';

const THEMES: { value: Settings['theme']; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function SettingsScreen() {
  const theme = useTheme();
  const { settings, update, toggleCategory } = useSettings();
  const { checkedAt } = useFeed();

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

  const Row = ({
    label,
    children,
    testID,
  }: {
    label: string;
    children: ReactNode;
    testID?: string;
  }) => (
    <View style={[styles.row, { borderBottomColor: theme.border }]} testID={testID}>
      <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
      {children}
    </View>
  );
  const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.muted }]}>{title}</Text>
      <View style={[styles.card, { backgroundColor: theme.card }]}>{children}</View>
    </View>
  );
  const Link = ({ label, url }: { label: string; url: string }) => (
    <Pressable
      onPress={() => void WebBrowser.openBrowserAsync(url)}
      accessibilityRole="link"
      style={[styles.row, { borderBottomColor: theme.border }]}
    >
      <Text style={[styles.label, { color: theme.accent }]}>{label}</Text>
    </Pressable>
  );

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
    >
      <Section title="APPEARANCE">
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
                <Text style={{ color: active ? theme.accentText : theme.text, fontWeight: '600' }}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section title="CATEGORIES IN YOUR FEED">
        {ALL_CATEGORIES.map((category) => (
          <Row key={category} label={CATEGORY_LABELS[category]}>
            <Switch
              value={settings.categories.includes(category)}
              onValueChange={() => toggleCategory(category)}
              accessibilityLabel={`Show ${CATEGORY_LABELS[category]}`}
              testID={`category-${category}`}
            />
          </Row>
        ))}
      </Section>

      <Section title="NOTIFICATIONS">
        <Row label="Top stories (max 2 a day)">
          <Switch
            value={settings.notifications === true}
            onValueChange={(on) => void setNotifications(on)}
            disabled={!isPushAvailable()}
            accessibilityLabel="Top story notifications"
            testID="notifications"
          />
        </Row>
      </Section>

      <Section title="PRIVACY">
        <Row label="Analytics & crash reports">
          <Switch
            value={settings.analytics}
            onValueChange={(on) => update({ analytics: on })}
            accessibilityLabel="Analytics and crash reports"
            testID="analytics"
          />
        </Row>
        <Link label="Privacy policy" url={config.privacyUrl} />
        <Link label="Support & feedback" url={config.supportUrl} />
      </Section>

      <Text style={[styles.footer, { color: theme.muted }]}>
        Version {Constants.expoConfig?.version ?? '?'}
        {checkedAt ? ` · Feed checked ${relativeTime(checkedAt)}` : ''}
        {'\n'}Summaries are written by AI from the linked articles and may contain mistakes.
      </Text>
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
  segmented: { flexDirection: 'row', gap: 8, padding: 12 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8 },
  footer: { fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 8 },
});
