import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { registerBackgroundRefresh } from '@/lib/backgroundRefresh';
import { BookmarksProvider } from '@/lib/bookmarks';
import { FeedProvider } from '@/lib/feed';
import { cardIdFromNotification } from '@/lib/push';
import { SettingsProvider, useSettings } from '@/lib/settings';
import { initTelemetry, setTelemetryEnabled, track, withTelemetry } from '@/lib/telemetry';
import { useTheme } from '@/lib/theme';

initTelemetry();

// Show top-story alerts even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: () =>
    Promise.resolve({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
});

function AppShell() {
  const theme = useTheme();
  const { settings, loaded } = useSettings();
  const lastResponse = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (loaded) setTelemetryEnabled(settings.analytics);
  }, [loaded, settings.analytics]);

  useEffect(() => {
    track('app_opened');
    void registerBackgroundRefresh();
  }, []);

  // Opening a notification jumps to its card.
  useEffect(() => {
    const cardId = cardIdFromNotification(lastResponse?.notification.request.content.data);
    if (cardId) {
      track('notification_opened');
      router.push(`/card/${cardId}`);
      void Notifications.clearLastNotificationResponseAsync();
    }
  }, [lastResponse]);

  return (
    <>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.card },
          headerTintColor: theme.text,
          contentStyle: { backgroundColor: theme.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="card/[id]" options={{ title: 'Story', presentation: 'card' }} />
      </Stack>
    </>
  );
}

function RootLayout() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <SettingsProvider>
          <BookmarksProvider>
            <FeedProvider>
              <AppShell />
            </FeedProvider>
          </BookmarksProvider>
        </SettingsProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

export default withTelemetry(RootLayout);
