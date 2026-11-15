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
 * The spots are painted on a 2D canvas (equirectangular, covering the zone's
 * bounding box) that is wrapped as a transparent skin just above the globe.
 * Between two months the sizes are interpolated, so spots grow and shrink.
 */

import type { ZoneGrid } from '../../utils/zoneCells';
import { GRID_RES_DEG, valueToAlpha, type DatasetInfo } from '../../data/datasetRegistry';

/** Below this share of the display range: no spot. */
export const MIN_SIZE = 0.12;
/** Opacity of each dataset's layer (overlapping datasets stay visible). */
const LAYER_ALPHA = 0.85;
const HALO_COLOR = 'rgba(255, 255, 255, 0.6)';
const HALO_BLUR = 3;
/** Largest spot radius, in grid cells. */
const RADIUS_CELLS = 0.8;
/** Share of the cells carrying a spot: a regular lattice would look like a grid. */
const SPOT_SHARE = 0.55;
/** Per dataset id: datasets present everywhere would cover the others. */
const OVERRIDES: Record<string, { radius?: number; share?: number }> = {
  co2: { radius: 0.35, share: 0.3 },
};
/** Canvas size limit (pixels per side). */
const MAX_CANVAS = 2048;
const MAX_PX_PER_DEG = 64;

export interface SpotBounds {
  latMin: number;
  latMax: number;
  lngMin: number;
  lngMax: number;
  /** Canvas pixels per degree. */
  ppd: number;
  width: number;
  height: number;
}

export interface DatasetSpots {
  lat: Float32Array;
  lng: Float32Array;
  /** Personal size factor of each spot (0.7 - 1.3). */
  scale: Float32Array;
  /** 1 when the cell carries a spot for this dataset. */
  shown: Uint8Array;
  /** Largest radius in degrees. */
  maxRadius: number;
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

/** Bounding box of the zone (plus one cell of margin) and the canvas covering it. */
export function spotBounds(grid: ZoneGrid): SpotBounds {
  const cell = cellDegrees(grid);
  let latMin = 90;
  let latMax = -90;
  let lngMin = 180;
  let lngMax = -180;
  for (const c of grid.cells) {
    if (c.lat < latMin) latMin = c.lat;
    if (c.lat > latMax) latMax = c.lat;
    if (c.lng < lngMin) lngMin = c.lng;
    if (c.lng > lngMax) lngMax = c.lng;
  }
  latMin = Math.max(-90, latMin - cell);
  latMax = Math.min(90, latMax + cell);
  lngMin = Math.max(-180, lngMin - cell);
  lngMax = Math.min(180, lngMax + cell);
  const spanLat = Math.max(latMax - latMin, cell);
  const spanLng = Math.max(lngMax - lngMin, cell);
  const ppd = Math.min(MAX_PX_PER_DEG, MAX_CANVAS / spanLat, MAX_CANVAS / spanLng);
  return {
    latMin,
    latMax: latMin + spanLat,
    lngMin,
    lngMax: lngMin + spanLng,
    ppd,
    width: Math.max(1, Math.ceil(spanLng * ppd)),
    height: Math.max(1, Math.ceil(spanLat * ppd)),
  };
}

/** Where each dataset's spots sit: built once per (zone, dataset). */
export function layoutSpots(grid: ZoneGrid, datasetId: string): DatasetSpots {
  const n = grid.cells.length;
  const cell = cellDegrees(grid);
  const o = OVERRIDES[datasetId] ?? {};
  const share = o.share ?? SPOT_SHARE;
  const seed = hashString(datasetId);
  const spots: DatasetSpots = {
    lat: new Float32Array(n),
    lng: new Float32Array(n),
    scale: new Float32Array(n),
    shown: new Uint8Array(n),
    maxRadius: (o.radius ?? RADIUS_CELLS) * cell,
  };
  grid.cells.forEach((c, i) => {
    // Seeded by the grid position, so a cell keeps its spot when the zone changes
    const h = Math.imul(c.row * 1440 + c.col, 4) ^ seed;
    spots.shown[i] = hash01(h) < share ? 1 : 0;
    spots.lat[i] = c.lat + (hash01(h + 1) - 0.5) * 0.9 * cell;
    spots.lng[i] = c.lng + (hash01(h + 2) - 0.5) * 0.9 * cell;
    spots.scale[i] = 0.7 + 0.6 * hash01(h + 3);
  });
  return spots;
}

/**
 * Signed spot size per cell, from -1 to 1: |size| from the display range,
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

export interface SpotLayer {
  info: DatasetInfo;
  spots: DatasetSpots;
  sizes: Float32Array;
}

/**
 * Paint the spots of every layer. `scratch` is a canvas of the same size,
 * used to merge one dataset's spots before blending it in.
 */
export function paintSpots(
  ctx: CanvasRenderingContext2D,
  scratch: CanvasRenderingContext2D,
  bounds: SpotBounds,
  layers: SpotLayer[]
): void {
  const { width, height, ppd, latMax, lngMin } = bounds;
  ctx.clearRect(0, 0, width, height);
  for (const { info, spots, sizes } of layers) {
    scratch.clearRect(0, 0, width, height);
    scratch.fillStyle = info.color;
    scratch.strokeStyle = info.color;
    const fill = new Path2D();
    let any = false;
    for (let i = 0; i < sizes.length; i++) {
      if (!spots.shown[i]) continue;
      const r = spotRadius(sizes[i], spots.maxRadius, spots.scale[i]);
      const ry = r * ppd;
      if (ry < 0.6) continue;
      const lat = spots.lat[i];
      // Equirectangular canvas: widen the spot so it stays round on the sphere
      const rx = ry / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
      const x = (spots.lng[i] - lngMin) * ppd;
      const y = (latMax - lat) * ppd;
      if (sizes[i] < 0) {
        const w = Math.max(1.2, ry * 0.32);
        scratch.lineWidth = w;
        scratch.beginPath();
        scratch.ellipse(x, y, Math.max(0.5, rx - w / 2), Math.max(0.5, ry - w / 2), 0, 0, Math.PI * 2);
        scratch.stroke();
      } else {
        fill.moveTo(x + rx, y);
        fill.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        any = true;
      }
    }
    if (any) scratch.fill(fill);
    // A faint light halo around each patch: dark colours (rain) stay visible
    // over the dark land and ocean of the Earth image
    ctx.globalAlpha = LAYER_ALPHA;
    ctx.shadowColor = HALO_COLOR;
    ctx.shadowBlur = HALO_BLUR;
    ctx.drawImage(scratch.canvas, 0, 0);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
}

/** Sizes between two months; `f` from 0 to 1, eased. */
export function blendSizes(from: Float32Array, to: Float32Array, f: number, out: Float32Array): Float32Array {
  const e = f * f * (3 - 2 * f);
  for (let i = 0; i < out.length; i++) out[i] = from[i] + (to[i] - from[i]) * e;
  return out;
}
