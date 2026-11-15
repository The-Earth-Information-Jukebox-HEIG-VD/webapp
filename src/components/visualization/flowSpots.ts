/**
 * "Flowing spots": the playback layer of the globe.
 *
 * Every dataset scatters its own spots over the zone (one per grid cell, for a
 * random share of the cells, at a random spot inside the cell). A spot's AREA
 * grows with the value; below a threshold there is no spot at all, so nothing
 * is drawn where nothing happens (no rain, no blue). Close spots of the same
 * dataset merge into patches. Signed anomalies (temperature) are a filled spot
 * above normal and a ring below, so the value never depends on colour alone.
 *
 * The spots are flat discs lying on the globe, drawn by the GPU as instanced
 * meshes (useSpotLayer). Each animation step only rewrites one 4 x 4 matrix
 * per spot (position, orientation, size): no picture is repainted or uploaded.
 * Between two months the sizes are interpolated, so spots grow and shrink.
 *
 * Everything here is pure (no WebGL), so it is unit tested.
 */

import type { ZoneGrid } from '../../utils/zoneCells';
import { GRID_RES_DEG, valueToAlpha, type DatasetInfo } from '../../data/datasetRegistry';

/** Below this share of the display range: no spot. */
export const MIN_SIZE = 0.12;
/** Largest spot radius, in grid cells. */
const RADIUS_CELLS = 0.8;
/** Share of the cells carrying a spot: a regular lattice would look like a grid. */
const SPOT_SHARE = 0.55;
/** Per dataset id: datasets present everywhere would cover the others. */
const OVERRIDES: Record<string, { radius?: number; share?: number }> = {
  co2: { radius: 0.35, share: 0.3 },
};

export interface DatasetSpots {
  /** Indices (in the zone grid) of the cells carrying a spot. */
  cells: Uint32Array;
  lat: Float32Array;
  lng: Float32Array;
  /** Personal size factor of each spot (0.7 - 1.3). */
  scale: Float32Array;
  /** Largest radius in degrees. */
  maxRadius: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Deterministic hash to [0, 1): the same zone always gets the same spots. */
export function hash01(n: number): number {
  let i = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  i ^= i >>> 13;
  i = Math.imul(i, 0xc2b2ae35);
  i ^= i >>> 16;
  return (i >>> 0) / 4294967296;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

/** Cell size of the zone grid, in degrees. */
export function cellDegrees(grid: ZoneGrid): number {
  return grid.stride * GRID_RES_DEG;
}

/** Where a dataset's spots sit: built once per (zone, dataset). */
export function layoutSpots(grid: ZoneGrid, datasetId: string): DatasetSpots {
  const cell = cellDegrees(grid);
  const o = OVERRIDES[datasetId] ?? {};
  const share = o.share ?? SPOT_SHARE;
  const seed = hashString(datasetId);
  const cells: number[] = [];
  const lat: number[] = [];
  const lng: number[] = [];
  const scale: number[] = [];
  grid.cells.forEach((c, i) => {
    // Seeded by the grid position, so a cell keeps its spot when the zone changes
    const h = Math.imul(c.row * 1440 + c.col, 4) ^ seed;
    if (hash01(h) >= share) return;
    cells.push(i);
    lat.push(c.lat + (hash01(h + 1) - 0.5) * 0.9 * cell);
    lng.push(c.lng + (hash01(h + 2) - 0.5) * 0.9 * cell);
    scale.push(0.7 + 0.6 * hash01(h + 3));
  });
  return {
    cells: Uint32Array.from(cells),
    lat: Float32Array.from(lat),
    lng: Float32Array.from(lng),
    scale: Float32Array.from(scale),
    maxRadius: (o.radius ?? RADIUS_CELLS) * cell,
  };
}

/**
 * Signed spot size per grid cell, from -1 to 1: |size| from the display range,
 * negative for values below zero in 'abs' (anomaly) datasets. NaN -> 0.
 */
export function spotSizes(values: Float32Array | null | undefined, n: number, info: DatasetInfo): Float32Array {
  const out = new Float32Array(n);
  if (!values) return out;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    const t = valueToAlpha(v, info.display);
    out[i] = info.display.mode === 'abs' && v < 0 ? -t : t;
  }
  return out;
}

/** Radius in degrees for a size (0 below the threshold). */
export function spotRadius(size: number, maxRadius: number, scale: number): number {
  const t = Math.abs(size);
  if (t < MIN_SIZE) return 0;
  return maxRadius * scale * Math.pow((t - MIN_SIZE) / (1 - MIN_SIZE), 0.75);
}

/** Sizes between two months; `f` from 0 to 1, eased. */
export function blendSizes(from: Float32Array, to: Float32Array, f: number, out: Float32Array): Float32Array {
  const e = f * f * (3 - 2 * f);
  for (let i = 0; i < out.length; i++) out[i] = from[i] + (to[i] - from[i]) * e;
  return out;
}

/**
 * Per spot, the frame of the disc on the globe: x and y axes along the
 * surface, z axis pointing out of the globe, then the position (12 floats).
 * `coords` is the globe's getCoords(lat, lng, altitude).
 */
export function spotFrames(spots: DatasetSpots, coords: (lat: number, lng: number) => Vec3): Float32Array {
  const n = spots.lat.length;
  const out = new Float32Array(n * 12);
  for (let k = 0; k < n; k++) {
    const p = coords(spots.lat[k], spots.lng[k]);
    const len = Math.hypot(p.x, p.y, p.z) || 1;
    const nz = [p.x / len, p.y / len, p.z / len];
    // x = up x n (east), with a fallback at the poles
    let ax = [nz[2], 0, -nz[0]];
    let al = Math.hypot(ax[0], ax[1], ax[2]);
    if (al < 1e-6) {
      ax = [1, 0, 0];
      al = 1;
    }
    ax = [ax[0] / al, ax[1] / al, ax[2] / al];
    const ay = [
      nz[1] * ax[2] - nz[2] * ax[1],
      nz[2] * ax[0] - nz[0] * ax[2],
      nz[0] * ax[1] - nz[1] * ax[0],
    ];
    out.set([...ax, ...ay, ...nz, p.x, p.y, p.z], k * 12);
  }
  return out;
}

/**
 * Disc and ring radii (world units) of each spot for the given sizes. A spot
 * is either a disc (value above zero) or a ring (below-normal anomaly): the
 * other radius is 0, which hides it.
 */
export function spotScales(
  sizes: Float32Array,
  spots: DatasetSpots,
  worldPerDegree: number,
  disc: Float32Array,
  ring: Float32Array
): void {
  for (let k = 0; k < spots.cells.length; k++) {
    const size = sizes[spots.cells[k]];
    const r = spotRadius(size, spots.maxRadius, spots.scale[k]) * worldPerDegree;
    disc[k] = size < 0 ? 0 : r;
    ring[k] = size < 0 ? r : 0;
  }
}

/** Fill an instanced mesh's matrices (column-major 4 x 4) from frames and radii. */
export function writeMatrices(out: Float32Array, frames: Float32Array, radii: Float32Array, factor = 1): void {
  for (let k = 0; k < radii.length; k++) {
    const s = radii[k] * factor;
    const f = k * 12;
    const o = k * 16;
    for (let a = 0; a < 3; a++) {
      out[o + a * 4] = frames[f + a * 3] * s;
      out[o + a * 4 + 1] = frames[f + a * 3 + 1] * s;
      out[o + a * 4 + 2] = frames[f + a * 3 + 2] * s;
      out[o + a * 4 + 3] = 0;
    }
    out[o + 12] = frames[f + 9];
    out[o + 13] = frames[f + 10];
    out[o + 14] = frames[f + 11];
    out[o + 15] = 1;
  }
}
