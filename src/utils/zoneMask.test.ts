import { describe, it, expect, vi, afterEach } from 'vitest';
import { MASK_COLS, MASK_ROWS, encodeMask, maskCell, maskFor, packMask } from './zoneMask';
import type { GridPoint } from '../types/zones';

afterEach(() => vi.unstubAllGlobals());

const pt = (lat: number, lng: number): GridPoint => ({ lat, lng, x: 0, y: 0 });

function isSet(bits: Uint8Array, row: number, col: number): boolean {
  const i = row * MASK_COLS + col;
  return (bits[i >> 3] & (0x80 >> (i & 7))) !== 0;
}

async function inflate(b64: string): Promise<Uint8Array> {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const stream = new Response(bytes).body!.pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

describe('maskCell', () => {
  it('places points on the backend 0.1 degree grid (row 0 = 90N, col 0 = 180W)', () => {
    expect(maskCell(90, -180)).toEqual([0, 0]);
    expect(maskCell(-90, 179.99)).toEqual([MASK_ROWS - 1, MASK_COLS - 1]); // capped like the backend
    expect(maskCell(0, 0)).toEqual([900, 1800]);
    expect(maskCell(48.8566, 2.3522)).toEqual([411, 1823]);
    expect(maskCell(10, 180)).toEqual([800, 0]); // 180E wraps to 180W
    expect(maskCell(10, 200)).toEqual([800, 200]); // lng up to 360 is accepted
  });
});

describe('packMask', () => {
  it('sets one bit per cell, row-major, highest bit first', () => {
    const bits = packMask([pt(90, -180), pt(0, 0), pt(0, 0)]);
    expect(bits.length).toBe((MASK_ROWS * MASK_COLS) / 8);
    expect(bits[0]).toBe(0x80);
    expect(isSet(bits, 900, 1800)).toBe(true);
    expect(isSet(bits, 900, 1801)).toBe(false);
    expect(bits.reduce((n, b) => n + (b.toString(2).match(/1/g)?.length ?? 0), 0)).toBe(2);
  });
});

describe('encodeMask', () => {
  it('is zlib of the packed grid, small even for an ocean-sized selection', async () => {
    const ocean: GridPoint[] = [];
    for (let lat = -55; lat <= 55; lat += 0.5) {
      for (let lng = 150; lng <= 280; lng += 0.5) ocean.push(pt(lat, ((lng + 180) % 360) - 180));
    }
    const mask = await encodeMask(ocean);
    expect(mask.length).toBeLessThan(5000); // ~3 MB as JSON points
    expect(await inflate(mask)).toEqual(packMask(ocean));
  });
});

describe('maskFor', () => {
  it('encodes a selection once and reuses it for every chunk', async () => {
    const points = [pt(46.5, 6.6)];
    const first = maskFor(points);
    expect(maskFor(points)).toBe(first);
    expect(await first).toBe(await encodeMask(points));
    expect(maskFor([pt(46.5, 6.6)])).not.toBe(first); // another selection
  });

  it('gives null without points or without CompressionStream (the points are sent instead)', async () => {
    expect(await maskFor([])).toBeNull();
    vi.stubGlobal('CompressionStream', undefined);
    expect(await maskFor([pt(1, 2)])).toBeNull();
  });
});
