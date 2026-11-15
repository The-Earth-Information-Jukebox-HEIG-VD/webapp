import { describe, it, expect } from 'vitest';
import {
  MIN_SIZE,
  blendSizes,
  hash01,
  layoutSpots,
  spotFrames,
  spotRadius,
  spotScales,
  spotSizes,
  writeMatrices,
} from './flowSpots';
import { KNOWN_DATASETS } from '../../data/datasetRegistry';
import type { ZoneGrid } from '../../utils/zoneCells';

const temperature = KNOWN_DATASETS.find((d) => d.id === 'temperature_anomaly')!;
const rain = KNOWN_DATASETS.find((d) => d.id === 'rain')!;

/** 20 x 20 cells of 1 deg (stride 4) around the equator. */
function grid(): ZoneGrid {
  const cells = [];
  for (let r = 0; r < 20; r++) {
    for (let c = 0; c < 20; c++) {
      const row = 340 + r * 4;
      const col = 720 + c * 4;
      cells.push({ row, col, lat: 90 - (row + 0.5) * 0.25, lng: -180 + (col + 0.5) * 0.25 });
    }
  }
  return { stride: 4, rowMin: 340, rowMax: 416, rowRuns: [[340, 416]], cells };
}

/** Sphere of radius 100, y up (like three-globe). */
function coords(lat: number, lng: number) {
  const phi = (lat * Math.PI) / 180;
  const theta = (lng * Math.PI) / 180;
  return { x: 100 * Math.cos(phi) * Math.sin(theta), y: 100 * Math.sin(phi), z: 100 * Math.cos(phi) * Math.cos(theta) };
}

describe('flowSpots layout', () => {
  it('scatters each dataset differently, the same way every time', () => {
    const g = grid();
    const a = layoutSpots(g, 'rain');
    expect(layoutSpots(g, 'rain')).toEqual(a);
    expect(layoutSpots(g, 'lightning').cells).not.toEqual(a.cells);
  });

  it('keeps every spot inside its own cell and puts spots on only a share of the cells', () => {
    const g = grid();
    const s = layoutSpots(g, 'rain');
    s.cells.forEach((cell, k) => {
      expect(Math.abs(s.lat[k] - g.cells[cell].lat)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(s.lng[k] - g.cells[cell].lng)).toBeLessThanOrEqual(0.5);
    });
    const share = s.cells.length / g.cells.length;
    expect(share).toBeGreaterThan(0.4);
    expect(share).toBeLessThan(0.7);
  });

  it('keeps CO2 spots small and sparse (it is present everywhere)', () => {
    const g = grid();
    const co2 = layoutSpots(g, 'co2');
    expect(co2.maxRadius).toBeLessThan(layoutSpots(g, 'rain').maxRadius);
    expect(co2.cells.length).toBeLessThan(g.cells.length * 0.45);
  });

  it('hashes to [0, 1)', () => {
    for (let i = 0; i < 1000; i++) {
      const h = hash01(i);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    }
  });
});

describe('flowSpots sizes', () => {
  it('gives no spot for nothing or no data, and a growing spot for more', () => {
    const sizes = spotSizes(new Float32Array([0, NaN, 0.1, 0.5, 3]), 5, rain);
    expect(sizes[0]).toBe(0);
    expect(sizes[1]).toBe(0);
    expect(spotRadius(sizes[2], 1, 1)).toBeGreaterThan(0);
    expect(spotRadius(sizes[3], 1, 1)).toBe(1);
    expect(sizes[4]).toBe(1); // capped at the top of the display range
    expect(spotRadius(MIN_SIZE / 2, 1, 1)).toBe(0);
  });

  it('marks colder-than-normal temperature as a negative size (drawn as a ring)', () => {
    const sizes = spotSizes(new Float32Array([2.5, -2.5]), 2, temperature);
    expect(sizes[0]).toBeCloseTo(0.5);
    expect(sizes[1]).toBeCloseTo(-0.5);
  });

  it('blends between months, from the start to the end values', () => {
    const from = new Float32Array([0, 1]);
    const to = new Float32Array([1, 0]);
    const out = new Float32Array(2);
    expect(blendSizes(from, to, 0, out)).toEqual(new Float32Array([0, 1]));
    expect(blendSizes(from, to, 1, out)).toEqual(new Float32Array([1, 0]));
    expect(blendSizes(from, to, 0.5, out)[0]).toBeCloseTo(0.5);
  });

  it('makes each spot either a disc or a ring, never both', () => {
    const g = grid();
    const s = layoutSpots(g, 'temperature_anomaly');
    const sizes = new Float32Array(g.cells.length);
    sizes[s.cells[0]] = 0.8;
    sizes[s.cells[1]] = -0.8;
    const disc = new Float32Array(s.cells.length);
    const ring = new Float32Array(s.cells.length);
    spotScales(sizes, s, 2, disc, ring);
    expect(disc[0]).toBeGreaterThan(0);
    expect(ring[0]).toBe(0);
    expect(disc[1]).toBe(0);
    expect(ring[1]).toBeGreaterThan(0);
    expect(disc[2]).toBe(0); // no value, no spot
  });
});

describe('flowSpots geometry', () => {
  it('lays each disc flat on the globe, facing out', () => {
    const g = grid();
    const s = layoutSpots(g, 'rain');
    const frames = spotFrames(s, coords);
    for (let k = 0; k < s.cells.length; k += 17) {
      const f = frames.subarray(k * 12, k * 12 + 12);
      const [x, y, n, p] = [f.subarray(0, 3), f.subarray(3, 6), f.subarray(6, 9), f.subarray(9, 12)];
      const dot = (a: Float32Array, b: Float32Array) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      expect(dot(x, n)).toBeCloseTo(0);
      expect(dot(y, n)).toBeCloseTo(0);
      expect(dot(x, y)).toBeCloseTo(0);
      expect(dot(n, p)).toBeCloseTo(100, 3); // normal points outward
      expect(Math.hypot(x[0], x[1], x[2])).toBeCloseTo(1);
    }
  });

  it('writes column-major matrices scaled by the radius, and a zero radius hides the spot', () => {
    const frames = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 5, 6, 7, 1, 0, 0, 0, 1, 0, 0, 0, 1, 8, 9, 10]);
    const out = new Float32Array(32);
    writeMatrices(out, frames, new Float32Array([2, 0]), 1.5);
    expect(Array.from(out.subarray(0, 16))).toEqual([3, 0, 0, 0, 0, 3, 0, 0, 0, 0, 3, 0, 5, 6, 7, 1]);
    expect(Array.from(out.subarray(16, 28))).toEqual(new Array(12).fill(0));
    expect(Array.from(out.subarray(28, 32))).toEqual([8, 9, 10, 1]);
  });
});
