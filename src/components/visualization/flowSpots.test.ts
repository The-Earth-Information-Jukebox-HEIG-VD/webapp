import { describe, it, expect } from 'vitest';
import {
  MIN_SIZE,
  blendSizes,
  hash01,
  layoutSpots,
  paintSpots,
  spotBounds,
  spotRadius,
  spotSizes,
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

describe('flowSpots layout', () => {
  it('scatters each dataset differently, the same way every time', () => {
    const g = grid();
    const a = layoutSpots(g, 'rain');
    const b = layoutSpots(g, 'rain');
    const c = layoutSpots(g, 'lightning');
    expect(a.lat).toEqual(b.lat);
    expect(a.shown).toEqual(b.shown);
    expect(a.lat).not.toEqual(c.lat);
  });

  it('keeps every spot inside its own cell and shows only a share of the cells', () => {
    const g = grid();
    const s = layoutSpots(g, 'rain');
    g.cells.forEach((cell, i) => {
      expect(Math.abs(s.lat[i] - cell.lat)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(s.lng[i] - cell.lng)).toBeLessThanOrEqual(0.5);
    });
    const share = s.shown.reduce((n, v) => n + v, 0) / g.cells.length;
    expect(share).toBeGreaterThan(0.4);
    expect(share).toBeLessThan(0.7);
  });

  it('keeps CO2 spots small and sparse (it is present everywhere)', () => {
    const g = grid();
    const co2 = layoutSpots(g, 'co2');
    expect(co2.maxRadius).toBeLessThan(layoutSpots(g, 'rain').maxRadius);
    expect(co2.shown.reduce((n, v) => n + v, 0)).toBeLessThan(g.cells.length * 0.45);
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
    const sizes = spotSizes(new Float32Array([0, NaN, 0.1, 0.75, 3]), 5, rain);
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
});

describe('flowSpots canvas', () => {
  it('covers the zone with a margin and keeps the canvas within limits', () => {
    const b = spotBounds(grid());
    expect(b.latMin).toBeLessThan(-14);
    expect(b.latMax).toBeGreaterThan(5);
    expect(b.width).toBeLessThanOrEqual(2048);
    expect(b.height).toBeLessThanOrEqual(2048);
    expect(b.width).toBeCloseTo((b.lngMax - b.lngMin) * b.ppd, -1);
  });

  it('paints filled spots and rings with the dataset colour', () => {
    const calls: string[] = [];
    const fake = (name: string) =>
      ({
        canvas: {},
        clearRect: () => calls.push(`${name}.clear`),
        fill: () => calls.push(`${name}.fill`),
        stroke: () => calls.push(`${name}.stroke`),
        beginPath: () => {},
        ellipse: () => {},
        drawImage: () => calls.push(`${name}.draw`),
        set fillStyle(v: string) { calls.push(`${name}.fillStyle=${v}`); },
        set strokeStyle(_v: string) {},
        set lineWidth(_v: number) {},
        set globalAlpha(_v: number) {},
        set shadowColor(_v: string) {},
        set shadowBlur(_v: number) {},
      }) as unknown as CanvasRenderingContext2D;
    globalThis.Path2D ??= class { moveTo() {} ellipse() {} } as unknown as typeof Path2D;

    const g = grid();
    const spots = layoutSpots(g, 'temperature_anomaly');
    const sizes = new Float32Array(g.cells.length).fill(1);
    const firstRing = spots.shown.indexOf(1);
    sizes[firstRing] = -1;
    paintSpots(fake('main'), fake('scratch'), spotBounds(g), [{ info: temperature, spots, sizes }]);
    expect(calls).toContain(`scratch.fillStyle=${temperature.color}`);
    expect(calls).toContain('scratch.fill');
    expect(calls).toContain('scratch.stroke');
    expect(calls).toContain('main.draw');
  });
});
