import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SettingsProvider, useSettings } from '../settings';
import { memoryStorage } from '../storage';

describe('SettingsProvider and category toggling', () => {
  it('toggles categories independently without cross-talk or affecting analytics', async () => {
    const store = memoryStorage();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <SettingsProvider store={store}>{children}</SettingsProvider>
    );

    const { result } = await renderHook(() => useSettings(), { wrapper });

    // Wait for initial load
    await act(async () => {
      await Promise.resolve();
    });

    // Initial state: all categories enabled, analytics true
    expect(result.current.settings.categories).toContain('models');
    expect(result.current.settings.categories).toContain('policy');
    expect(result.current.settings.categories).toContain('open-source');
    expect(result.current.settings.analytics).toBe(true);

    // Toggle off "models"
    await act(async () => {
      result.current.toggleCategory('models', false);
    });

    expect(result.current.settings.categories).not.toContain('models');
    // Policy and Open-source remain enabled
    expect(result.current.settings.categories).toContain('policy');
    expect(result.current.settings.categories).toContain('open-source');
    expect(result.current.settings.analytics).toBe(true);

    // Toggle off "open-source"
    await act(async () => {
      result.current.toggleCategory('open-source', false);
    });

    expect(result.current.settings.categories).not.toContain('open-source');
    // Analytics remains true
    expect(result.current.settings.analytics).toBe(true);

    // Update analytics to false
    await act(async () => {
      result.current.update({ analytics: false });
    });

    expect(result.current.settings.analytics).toBe(false);
    // Categories are untouched
    expect(result.current.settings.categories).not.toContain('open-source');
    expect(result.current.settings.categories).toContain('policy');

    // Toggle on "models"
    await act(async () => {
      result.current.toggleCategory('models', true);
    });

    expect(result.current.settings.categories).toContain('models');
    expect(result.current.settings.analytics).toBe(false);
  });
});
