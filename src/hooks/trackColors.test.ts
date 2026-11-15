import { describe, it, expect } from 'vitest';
import { TRACK_COLORS } from './useInstruments';

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// surface, chart plot background, high-contrast surface and background
const BACKGROUNDS = ['#1a1f2e', '#1e2433', '#1a1a1a', '#000000'];

describe('TRACK_COLORS accessibility contrast', () => {
  it('has a colour for fires', () => {
    expect(TRACK_COLORS.fires).toBe('#da154c');
  });

  for (const [id, color] of Object.entries(TRACK_COLORS)) {
    it(`${id} (${color}) reaches 3:1 on every background`, () => {
      for (const bg of BACKGROUNDS) {
        expect(contrast(color, bg), `${id} on ${bg}`).toBeGreaterThanOrEqual(3);
      }
    });
  }
});
