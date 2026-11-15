/**
 * The selected area as a compact `mask` (sonification/backend/FRONTEND_API.md, v2.5).
 *
 * As a list of points an ocean is ~57 000 entries, ~3 MB of JSON sent again with
 * every 30 s chunk; the whole globe is 14 MB. The mask describes exactly the same
 * cells in 2 to 4 kB:
 *
 *   1. a grid of 1800 x 3600 cells (0.1 degree), row 0 = 90N, column 0 = 180W,
 *      the grid the backend places the points on;
 *   2. packed 8 cells per byte, row-major, first cell = highest bit;
 *   3. zlib-compressed (CompressionStream "deflate"), then base64.
 */

import type { GridPoint } from '../types/zones';

export const MASK_ROWS = 1800;
export const MASK_COLS = 3600;

/**
 * Row and column of the 0.1 degree cell a point falls in. These are exactly the
 * backend's operations, in the same order (`points_to_cells`), so the
 * floating-point rounding matches and the mask selects the cells the points would.
 */
export function maskCell(lat: number, lng: number): [number, number] {
  const row = Math.min(Math.floor(((90 - lat) * MASK_ROWS) / 180), MASK_ROWS - 1);
  const col = Math.min(Math.floor((((lng + 180) % 360) * MASK_COLS) / 360), MASK_COLS - 1);
  return [row, col];
}

/** The points' cells as a packed bit grid (810 000 bytes, uncompressed). */
export function packMask(points: readonly GridPoint[]): Uint8Array<ArrayBuffer> {
  const bits = new Uint8Array((MASK_ROWS * MASK_COLS) / 8);
  for (const p of points) {
    const [row, col] = maskCell(p.lat, p.lng);
    const i = row * MASK_COLS + col;
    bits[i >> 3] |= 0x80 >> (i & 7);
  }
  return bits;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const step = 0x8000; // String.fromCharCode takes a bounded number of arguments
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

/** True when the browser can build a mask (CompressionStream: all current browsers). */
export function canEncodeMask(): boolean {
  return typeof CompressionStream !== 'undefined';
}

/** The `mask` field for these points. Rejects when compression is unavailable. */
export async function encodeMask(points: readonly GridPoint[]): Promise<string> {
  // Response(...).body rather than Blob.stream(): the same stream, also available in test DOMs
  const stream = new Response(packMask(points)).body!.pipeThrough(new CompressionStream('deflate'));
  return toBase64(new Uint8Array(await new Response(stream).arrayBuffer()));
}

// One encoding per selection: the same points array is sent with every chunk and
// with the data graph's request. A WeakMap lets it go with the selection.
const cache = new WeakMap<readonly GridPoint[], Promise<string | null>>();

/**
 * The mask of a selection, or null when it cannot be built (no CompressionStream,
 * or no points): the caller then sends the points, which the backend still accepts.
 */
export function maskFor(points: readonly GridPoint[]): Promise<string | null> {
  if (points.length === 0 || !canEncodeMask()) return Promise.resolve(null);
  let hit = cache.get(points);
  if (!hit) {
    hit = encodeMask(points).catch(() => null);
    cache.set(points, hit);
  }
  return hit;
}
