import type { CardPalette, Category } from './schemas';

export const CATEGORY_HUES: Record<Category, number> = {
  models: 242, // Indigo
  research: 158, // Emerald
  products: 275, // Purple
  business: 38, // Amber
  policy: 345, // Rose
  'open-source': 192, // Cyan
};

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function hslToHex(h: number, s: number, l: number): string {
  const normL = l / 100;
  const a = (s * Math.min(normL, 1 - normL)) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = normL - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}

/**
 * Generates an accessible, vibrant, deterministic palette for a card.
 * Shifts slightly based on imageUrl hash so each card feels distinct.
 */
export function generateCardPalette(category: Category, imageUrl?: string | null): CardPalette {
  const baseHue = CATEGORY_HUES[category] ?? 240;
  let hue = baseHue;
  if (imageUrl) {
    const shift = (hashString(imageUrl) % 50) - 25; // Shift +/- 25 degrees
    hue = (baseHue + shift + 360) % 360;
  }

  return {
    primary: hslToHex(hue, 75, 62),
    accent: hslToHex(hue, 80, 58),
    accentText: '#FFFFFF',
    chip: hslToHex(hue, 35, 18),
    card: hslToHex(hue, 25, 9),
    background: hslToHex(hue, 20, 6),
  };
}
