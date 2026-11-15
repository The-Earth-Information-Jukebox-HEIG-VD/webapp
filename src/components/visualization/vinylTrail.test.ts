import { describe, it, expect } from 'vitest';
import { timeSpot, trailLayers, trailSize, trailSpots } from './vinylTrail';
import { KNOWN_DATASETS } from '../../data/datasetRegistry';
import type { Track } from '../../types/tracks';
import type { VinylChunkMeta } from '../../services/vinylApi';

const track = (id: string) => ({ id, color: '#ffffff', nameKey: id, label: id, units: null }) as Track;
const temperature = KNOWN_DATASETS.find((d) => d.trackIds.includes('temperature'))!;
const rain = KNOWN_DATASETS.find((d) => d.trackIds.includes('precipitation'))!;

function groove(k: number, values: Record<string, number | null>[]): VinylChunkMeta {
  return {
    chunkIndex: k,
    nextChunkIndex: k + 1,
    center: { lat: 0, lng: 0 },
    timePeriod: '2018-07',
      travel: 'space',
      periods: ['2020-03'],
      barStarts: null,
    stops: values.map((v, i) => ({ lat: k, lng: i * 5, values: v })),
    stopSeconds: 0.75,
    radiusDeg: 2,
    values: {},
  };
}

describe('vinylTrail', () => {
  it('maps tracks to the datasets drawn by zone mode', () => {
    const layers = trailLayers([track('temperature'), track('precipitation'), track('not-a-dataset')]);
    expect(layers.map((l) => l.info.id)).toEqual([temperature.id, rain.id]);
  });

  it('sizes like the flowing spots: signed for anomalies, nothing for null', () => {
    expect(trailSize(null, temperature)).toBe(0);
    expect(trailSize(NaN, rain)).toBe(0);
    expect(trailSize(-1, temperature)).toBeLessThan(0);
    expect(trailSize(1, temperature)).toBeGreaterThan(0);
    expect(trailSize(rain.display.max * 2, rain)).toBe(1);
  });

  it('keeps every stop of the grooves heard, the reached ones of the current groove', () => {
    const layers = trailLayers([track('precipitation')]);
    const history = {
      0: groove(0, [{ precipitation: 0.3 }, { precipitation: 0 }, { precipitation: null }, { precipitation: 0.4 }]),
      1: groove(1, [{ precipitation: 0.2 }, { precipitation: 0.2 }, { precipitation: 0.2 }]),
    };
    const [spots] = trailSpots(history, 1, 2, layers);
    // Groove 0: 0 and null leave no spot; groove 1: only the 2 stops reached
    expect(Array.from(spots.lat)).toEqual([0, 0, 1, 1]);
    expect(spots.maxRadius).toBeGreaterThan(0);
    for (const s of spots.scale) {
      expect(s).toBeGreaterThanOrEqual(0.7);
      expect(s).toBeLessThanOrEqual(1.3);
    }
  });

  it('spreads several datasets around the same stop', () => {
    const layers = trailLayers([track('temperature'), track('precipitation')]);
    const history = { 0: groove(0, [{ temperature: 1, precipitation: 0.4 }]) };
    const [a, b] = trailSpots(history, 5, 0, layers);
    expect(a.lat.length).toBe(1);
    expect(b.lat.length).toBe(1);
    expect(Math.hypot(a.lat[0] - b.lat[0], a.lng[0] - b.lng[0])).toBeGreaterThan(0.5);
  });

  it('timeSpot: one centre spot from the first dataset with a value, stronger for more', () => {
    const layers = trailLayers([track('temperature'), track('precipitation')]);
    expect(timeSpot({ temperature: null, precipitation: 0 }, layers)).toBeNull();
    const weak = timeSpot({ temperature: 0.3 }, layers)!;
    const strong = timeSpot({ temperature: 3 }, layers)!;
    expect(weak.trackId).toBe('temperature');
    expect(strong.radius).toBeGreaterThan(weak.radius);
    expect(strong.color).toMatch(/^rgba\(/);
    // Falls through to the next dataset when the first has no value
    expect(timeSpot({ temperature: null, precipitation: 0.4 }, layers)!.trackId).toBe('precipitation');
    expect(timeSpot(undefined, layers)).toBeNull();
  });
});
