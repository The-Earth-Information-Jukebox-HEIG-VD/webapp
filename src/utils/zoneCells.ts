/**
 * Map a zone polygon onto the volume's common grid (720 x 1440, 0.25 deg,
 * row 0 = 90N, column 0 = 180W).
 *
 * Large zones are subsampled with a stride: every n-th real grid cell is kept
 * with its stored value (nothing is averaged or interpolated).
 */

import type { ZoneFeature } from '../types/zones';
import { GRID_COLS, GRID_RES_DEG, GRID_ROWS } from '../data/datasetRegistry';
import { getFeatureBoundingBox, pointInMultiPolygon } from './geometry';

export interface GridCell {
  row: number;
  col: number;
  /** Cell centre. */
  lat: number;
  lng: number;
}

export interface ZoneGrid {
  stride: number;
  /** First and last rows touched by the cells. */
  rowMin: number;
  rowMax: number;
  /**
   * Inclusive row spans to download (one Range request each). Rows far apart
   * (e.g. Europe and French Guiana) are split to avoid fetching what lies between.
   */
  rowRuns: [number, number][];
  cells: GridCell[];
}

/** Rows further apart than this start a new Range request. */
const MAX_ROW_GAP = 32;

function toRowRuns(rows: number[]): [number, number][] {
  const sorted = [...new Set(rows)].sort((a, b) => a - b);
  const runs: [number, number][] = [];
  for (const r of sorted) {
    const last = runs[runs.length - 1];
    if (last && r - last[1] <= MAX_ROW_GAP) last[1] = r;
    else runs.push([r, r]);
  }
  return runs;
}

/** Target number of cells per dataset drawn on the globe. */
export const MAX_ZONE_CELLS = 3000;
const STRIDES = [1, 2, 4, 8, 16, 32];

export const rowToLat = (row: number) => 90 - (row + 0.5) * GRID_RES_DEG;
export const colToLng = (col: number) => -180 + (col + 0.5) * GRID_RES_DEG;
export const latToRow = (lat: number) =>
  Math.min(GRID_ROWS - 1, Math.max(0, Math.floor((90 - lat) / GRID_RES_DEG)));
export const lngToCol = (lng: number) =>
  Math.min(GRID_COLS - 1, Math.max(0, Math.floor((lng + 180) / GRID_RES_DEG)));

function polygonsOf(feature: ZoneFeature): number[][][][] {
  return feature.geometry.type === 'Polygon'
    ? [feature.geometry.coordinates as number[][][]]
    : (feature.geometry.coordinates as number[][][][]);
}

function sample(feature: ZoneFeature, stride: number): GridCell[] {
  const polygons = polygonsOf(feature);
  const bbox = getFeatureBoundingBox(feature);
  const r0 = latToRow(bbox.maxLat);
  const r1 = latToRow(bbox.minLat);
  const c0 = lngToCol(bbox.minLng);
  const c1 = lngToCol(bbox.maxLng);
  // Align on multiples of the stride and take the middle cell of each block,
  // so all zones share the same lattice (and 2 deg source blocks stay whole).
  const offset = Math.floor(stride / 2);
  const cells: GridCell[] = [];
  for (let row = Math.floor(r0 / stride) * stride + offset; row <= r1; row += stride) {
    if (row < r0) continue;
    const lat = rowToLat(row);
    for (let col = Math.floor(c0 / stride) * stride + offset; col <= c1; col += stride) {
      if (col < c0) continue;
      const lng = colToLng(col);
      if (pointInMultiPolygon([lng, lat], polygons)) {
        cells.push({ row, col, lat, lng });
      }
    }
  }
  return cells;
}

/**
 * Grid cells inside a zone, with the smallest stride keeping at most
 * `maxCells` cells.
 */
export function getZoneGrid(feature: ZoneFeature, maxCells: number = MAX_ZONE_CELLS): ZoneGrid {
  // Cheap estimate on a coarse lattice, then pick the stride from it
  const coarse = 16;
  const estimate = sample(feature, coarse).length * coarse * coarse;
  let stride = STRIDES[STRIDES.length - 1];
  for (const s of STRIDES) {
    if (estimate / (s * s) <= maxCells) {
      stride = s;
      break;
    }
  }
  let cells = sample(feature, stride);
  // The estimate can be off for thin shapes: coarsen until it fits
  while (cells.length > maxCells && stride < STRIDES[STRIDES.length - 1]) {
    stride *= 2;
    cells = sample(feature, stride);
  }
  // Tiny zones (smaller than one cell): keep the cell under the centre of the bbox
  if (!cells.length) {
    const b = getFeatureBoundingBox(feature);
    const row = latToRow((b.minLat + b.maxLat) / 2);
    const col = lngToCol((b.minLng + b.maxLng) / 2);
    cells = [{ row, col, lat: rowToLat(row), lng: colToLng(col) }];
    stride = 1;
  }
  let rowMin = GRID_ROWS;
  let rowMax = -1;
  for (const c of cells) {
    if (c.row < rowMin) rowMin = c.row;
    if (c.row > rowMax) rowMax = c.row;
  }
  return { stride, rowMin, rowMax, rowRuns: toRowRuns(cells.map((c) => c.row)), cells };
}
