import { describe, it, expect } from 'vitest';
import type { ZoneFeature } from '../../types/zones';
import {
  calculateSignedArea,
  normalizeWinding,
  getZoneFeatures,
  findZoneFeature,
  getOceans,
  getSeasByOcean,
  getInlandSeas,
} from './index';

const CCW_SQUARE = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
const CW_SQUARE = [...CCW_SQUARE].reverse();

function polygonsOf(feature: ZoneFeature): number[][][][] {
  return feature.geometry.type === 'Polygon'
    ? [feature.geometry.coordinates as number[][][]]
    : (feature.geometry.coordinates as number[][][][]);
}

function makeFeature(coordinates: number[][][]): ZoneFeature {
  return {
    type: 'Feature',
    properties: { id: 't', name: 'T', nameKey: 'zones.t', type: 'country' },
    geometry: { type: 'Polygon', coordinates },
  };
}

describe('calculateSignedArea', () => {
  it('is positive for counter-clockwise rings', () => {
    expect(calculateSignedArea(CCW_SQUARE)).toBe(100);
  });

  it('is negative for clockwise rings', () => {
    expect(calculateSignedArea(CW_SQUARE)).toBe(-100);
  });
});

describe('normalizeWinding', () => {
  it('reverses a counter-clockwise outer ring', () => {
    const result = normalizeWinding(makeFeature([CCW_SQUARE]));
    const ring = (result.geometry.coordinates as number[][][])[0];
    expect(calculateSignedArea(ring)).toBeLessThan(0);
  });

  it('leaves an already-clockwise outer ring untouched', () => {
    const result = normalizeWinding(makeFeature([CW_SQUARE]));
    expect((result.geometry.coordinates as number[][][])[0]).toEqual(CW_SQUARE);
  });

  it('orients holes counter-clockwise', () => {
    const hole = [[2, 2], [2, 8], [8, 8], [8, 2], [2, 2]]; // clockwise
    const result = normalizeWinding(makeFeature([CCW_SQUARE, hole]));
    const [outer, inner] = result.geometry.coordinates as number[][][];
    expect(calculateSignedArea(outer)).toBeLessThan(0);
    expect(calculateSignedArea(inner)).toBeGreaterThan(0);
  });
});

describe.each(['continent', 'country', 'water'] as const)('%s zone data', (type) => {
  it('has every outer ring clockwise for d3-geo', () => {
    for (const feature of getZoneFeatures(type)) {
      for (const polygon of polygonsOf(feature)) {
        expect(
          calculateSignedArea(polygon[0]),
          `${feature.properties.id} outer ring`
        ).toBeLessThan(0);
      }
    }
  });
});

describe('findZoneFeature', () => {
  it('returns normalized geometry for mixed-winding countries (USA)', () => {
    const usa = findZoneFeature('usa');
    expect(usa).toBeDefined();
    for (const polygon of polygonsOf(usa!)) {
      expect(calculateSignedArea(polygon[0])).toBeLessThan(0);
    }
  });
});

describe('water zone data', () => {
  it('has the five oceans', () => {
    expect(getOceans().map((f) => f.properties.id).sort()).toEqual([
      'arcticOcean', 'atlanticOcean', 'indianOcean', 'pacificOcean', 'southernOcean',
    ]);
  });

  it('assigns every sea to an ocean, except inland seas', () => {
    const grouped = getOceans().flatMap((o) => getSeasByOcean(o.properties.id));
    const inland = getInlandSeas().map((f) => f.properties.id);
    const seas = getZoneFeatures('water').filter((f) => f.properties.type === 'sea');
    expect(inland).toEqual(['caspianSea']);
    expect(grouped.length + inland.length).toBe(seas.length);
  });

  it('gives every water body a centre, antimeridian-safe for the Pacific', () => {
    for (const f of getZoneFeatures('water')) {
      expect(f.properties.center, f.properties.id).toBeDefined();
    }
    const [lng] = findZoneFeature('pacificOcean')!.properties.center!;
    expect(Math.abs(lng)).toBeGreaterThan(120); // not averaged to ~0° (Africa)
  });
});
