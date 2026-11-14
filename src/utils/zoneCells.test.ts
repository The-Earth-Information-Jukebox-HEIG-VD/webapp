import { describe, it, expect } from 'vitest';
import { findZoneFeature } from '../data/zones';
import { getZoneGrid, latToRow, lngToCol, rowToLat, colToLng, MAX_ZONE_CELLS } from './zoneCells';

describe('volume grid coordinates', () => {
  it('matches the datasets README formula (46.5N 6.63E -> row 174, column 746)', () => {
    expect(latToRow(46.5)).toBe(174);
    expect(lngToCol(6.63)).toBe(746);
  });

  it('gives cell centres, row 0 = north, column 0 = 180W', () => {
    expect(rowToLat(0)).toBe(89.875);
    expect(colToLng(0)).toBe(-179.875);
  });
});

describe('getZoneGrid', () => {
  // Natural Earth "Europe" includes overseas parts (e.g. French Guiana)
  it('keeps Europe cells mostly in Europe, within the cell budget', () => {
    const europe = findZoneFeature('europe');
    expect(europe).toBeDefined();
    const grid = getZoneGrid(europe!);
    expect(grid.cells.length).toBeGreaterThan(100);
    expect(grid.cells.length).toBeLessThanOrEqual(MAX_ZONE_CELLS);
    const inMainland = grid.cells.filter((c) => c.lat > 30 && c.lat < 85 && c.lng > -30 && c.lng < 70);
    expect(inMainland.length / grid.cells.length).toBeGreaterThan(0.9);
    for (const c of grid.cells) {
      expect(c.row % grid.stride).toBe(Math.floor(grid.stride / 2));
    }
    expect(grid.rowMin).toBe(Math.min(...grid.cells.map((c) => c.row)));
    expect(grid.rowMax).toBe(Math.max(...grid.cells.map((c) => c.row)));
    // Every cell row is downloaded, and French Guiana gets its own Range request
    for (const c of grid.cells) {
      expect(grid.rowRuns.some(([r0, r1]) => c.row >= r0 && c.row <= r1)).toBe(true);
    }
    expect(grid.rowRuns.length).toBeGreaterThan(1);
  });

  it('uses the full 0.25 deg resolution for small zones', () => {
    const switzerland = findZoneFeature('switzerland');
    expect(switzerland).toBeDefined();
    const grid = getZoneGrid(switzerland!);
    expect(grid.stride).toBe(1);
    expect(grid.cells.some((c) => c.row === 174 && c.col === 746)).toBe(true); // Lausanne
  });
});
