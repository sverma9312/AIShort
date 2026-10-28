import type * as ReactNative from 'react-native';

// Native modules that jest-expo doesn't mock.
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual<object>('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-pager-view', () => ({
  __esModule: true,
  default: jest.requireActual<typeof ReactNative>('react-native').View,
}));
