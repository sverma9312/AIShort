import type { ConfigContext, ExpoConfig } from 'expo/config';

// ---------------------------------------------------------------------------------------------
// Branding. "AIShort" is a working title: change these before the first store upload.
// APP_ID identifies the app in both stores and can never change after the first release.
// ---------------------------------------------------------------------------------------------
const APP_NAME = 'AIShort';
const APP_SLUG = 'aishort';
const APP_ID = 'io.github.sverma9312.aishort';
const SCHEME = 'aishort';
const VERSION = '1.0.0';
const BRAND_COLOR = '#4F46E5';

// Set after `eas init` (see docs/release.md). Without it, EAS Update and push tokens are disabled.
const projectId = process.env.EAS_PROJECT_ID;
// Optional: enables source map upload to Sentry during EAS builds (needs SENTRY_AUTH_TOKEN).
const sentryOrg = process.env.SENTRY_ORG;
const sentryProject = process.env.SENTRY_PROJECT;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: APP_NAME,
  slug: APP_SLUG,
  scheme: SCHEME,
  version: VERSION,
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: APP_ID,
    supportsTablet: true,
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    package: APP_ID,
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: { favicon: './assets/images/favicon.png' },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      { backgroundColor: BRAND_COLOR, image: './assets/images/splash-icon.png', imageWidth: 76 },
    ],
    [
      'expo-notifications',
      { icon: './assets/images/android-icon-monochrome.png', color: BRAND_COLOR },
    ],
    'expo-background-task',
    ...(sentryOrg && sentryProject
      ? [
          ['@sentry/react-native/expo', { organization: sentryOrg, project: sentryProject }] as [
            string,
            object,
          ],
        ]
      : []),
  ],
  runtimeVersion: { policy: 'appVersion' },
  ...(projectId ? { updates: { url: `https://u.expo.dev/${projectId}` } } : {}),
  extra: {
    ...(projectId ? { eas: { projectId } } : {}),
  },
});
