import { describe, it, expect } from 'vitest';
import { TRACK_COLORS, FALLBACK_TRACK_COLOR, trackColor } from './trackColors';
import { KNOWN_DATASETS, datasetForFolder } from './datasetRegistry';

describe('shared track palette', () => {
  it('every known dataset uses the colour of its track', () => {
    for (const ds of KNOWN_DATASETS) {
      const id = ds.trackIds.find((t) => t in TRACK_COLORS);
      expect(id, `${ds.id} has a palette track`).toBeDefined();
      expect(ds.color, ds.id).toBe(TRACK_COLORS[id as string]);
    }
  });

  it('snow resolves to the snow colour, not the fallback', () => {
    const snow = KNOWN_DATASETS.find((d) => d.id === 'snow');
    expect(snow?.color).toBe(TRACK_COLORS.snow);
  });

  it('palette values are unique and distinct from the fallback', () => {
    const values = Object.values(TRACK_COLORS);
    expect(new Set(values).size).toBe(values.length);
    expect(values).not.toContain(FALLBACK_TRACK_COLOR);
  });

  it('unknown ids and folders get the fallback', () => {
    expect(trackColor('nope')).toBe(FALLBACK_TRACK_COLOR);
    expect(datasetForFolder('mystery_folder', 'mystery', 0).color).toBe(FALLBACK_TRACK_COLOR);
  });
});
