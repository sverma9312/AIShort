import { useColorScheme } from 'react-native';
import { useSettings } from './settings';

export interface Theme {
  dark: boolean;
  isDynamic: boolean;
  background: string;
  card: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  accentText: string;
  chip: string;
  danger: string;
}

const light: Theme = {
  dark: false,
  isDynamic: false,
  background: '#F4F4F6',
  card: '#FFFFFF',
  text: '#111114',
  muted: '#5B5B66',
  border: '#E3E3E8',
  accent: '#4F46E5',
  accentText: '#FFFFFF',
  chip: '#EEF0FF',
  danger: '#B42318',
};

const dark: Theme = {
  dark: true,
  isDynamic: false,
  background: '#0B0B0E',
  card: '#17171C',
  text: '#F2F2F5',
  muted: '#A0A0AB',
  border: '#2A2A31',
  accent: '#A5B4FC',
  accentText: '#0B0B0E',
  chip: '#23233A',
  danger: '#F97066',
};

export function useTheme(): Theme {
  const system = useColorScheme();
  const { settings } = useSettings();
  const isDynamic = settings.theme === 'dynamic';
  const mode =
    settings.theme === 'dynamic' || settings.theme === 'system'
      ? (system ?? 'dark')
      : settings.theme;
  const base = mode === 'dark' ? dark : light;
  return isDynamic ? { ...base, isDynamic: true } : base;
}
