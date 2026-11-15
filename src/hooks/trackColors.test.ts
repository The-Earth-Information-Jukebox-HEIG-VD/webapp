import { describe, it, expect } from 'vitest';
import { TRACK_COLORS } from './useInstruments';
import { contrast } from '../test/contrast';

// surface, chart plot background (elevated), page background, high-contrast surface and background
const BACKGROUNDS = ['#0f203e', '#112445', '#071327', '#1a1a1a', '#000000'];

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
