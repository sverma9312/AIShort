import { describe, expect, it } from 'vitest';
import { CATEGORIES } from './constants';
import { generateCardPalette } from './palette';

describe('generateCardPalette', () => {
  it('generates consistent palette for each category', () => {
    for (const cat of CATEGORIES) {
      const p1 = generateCardPalette(cat);
      const p2 = generateCardPalette(cat);
      expect(p1).toEqual(p2);
      expect(p1.primary).toMatch(/^#[0-9A-F]{6}$/);
      expect(p1.accent).toMatch(/^#[0-9A-F]{6}$/);
      expect(p1.chip).toMatch(/^#[0-9A-F]{6}$/);
      expect(p1.card).toMatch(/^#[0-9A-F]{6}$/);
      expect(p1.background).toMatch(/^#[0-9A-F]{6}$/);
      expect(p1.accentText).toBe('#FFFFFF');
    }
  });

  it('shifts palette deterministically when imageUrl is provided', () => {
    const pNoImage = generateCardPalette('models', null);
    const pWithImageA = generateCardPalette('models', 'https://example.com/a.jpg');
    const pWithImageB = generateCardPalette('models', 'https://example.com/b.jpg');

    expect(pNoImage.accent).toMatch(/^#[0-9A-F]{6}$/);
    expect(pWithImageA.accent).toMatch(/^#[0-9A-F]{6}$/);
    expect(pWithImageB.accent).toMatch(/^#[0-9A-F]{6}$/);

    // Same URL should produce identical output
    expect(generateCardPalette('models', 'https://example.com/a.jpg')).toEqual(pWithImageA);
  });
});
