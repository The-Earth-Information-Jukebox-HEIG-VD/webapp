/**
 * Vinyl mode API: the record is played through POST /api/zones/groove
 * (FRONTEND_API.md section 4, API v2.6).
 *
 * The date stays fixed; the place moves. For groove k the frontend sends the
 * path the needle crosses (groovePath: 10 bars of 3 s, up to 4 points per bar)
 * and gets back 30 s of music plus one stop per point: stops[i] plays from
 * i * stop_seconds. The groove endpoint has no "next" cursor, the frontend
 * chooses the next stretch (k + 1) itself.
 */
import {
  addMonths,
  fetchGroove,
  monthsBetween,
  periodToYear,
  type GrooveRequest,
  type GrooveResponse,
  type ZoneDataResponse,
} from './sonificationApi';
import type { ChunkFetcher } from '../audio/ChunkPlayer';
import {
  BARS_PER_CHUNK,
  GROOVE_RADIUS_DEG,
  VINYL_CHUNKS,
  clampCenter,
  groovePath,
  type LatLng,
} from '../utils/vinylGeometry';

// ---------------------------------------------------------------------------
// One groove
// ---------------------------------------------------------------------------

export interface VinylRequest {
  dataset_ids: string[];
  /** The single month the whole record plays, "YYYY-MM" */
  time_period: string;
  /** Record centre (the camera looks straight down at it) */
  center: LatLng;
  /** 0-based groove to play */
  chunk_index: number;
}

/** A place the needle reads; null = no data there (that instrument is silent) */
export interface VinylStop {
  lat: number;
  lng: number;
  values: Record<string, number | null>;
}

export interface VinylResponse {
  dataset_ids: string[];
  time_period: string;
  center: LatLng;
  chunk_index: number;
  /** Groove to request next; null at the end of the side */
  next_chunk_index: number | null;
  chunk_count: number;
  /** stops[i] plays from i * stop_seconds */
  stops: VinylStop[];
  stop_seconds: number;
  radius_deg: number;
  /** Base64 MP3 (30 s) */
  audio_data: string;
  /** Mean of the non-null stop values, per dataset_id */
  values: Record<string, number>;
}

export interface VinylDeps {
  fetchGroove: (req: GrooveRequest, signal?: AbortSignal) => Promise<GrooveResponse>;
}

const DEFAULT_DEPS: VinylDeps = { fetchGroove };

/** The groove request for chunk k of the record centred on `center`. */
export function buildGrooveRequest(
  center: LatLng,
  k: number,
  timePeriod: string,
  datasetIds: string[]
): GrooveRequest {
  const c = clampCenter(center);
  const { pointsPerBar, path } = groovePath(c, k);
  return {
    zone_id: `record-${c.lat.toFixed(1)}_${c.lng.toFixed(1)}`,
    dataset_ids: datasetIds,
    time_period: timePeriod,
    points_per_bar: pointsPerBar,
    radius_deg: GROOVE_RADIUS_DEG,
    path: path.map((p) => ({ lat: p.lat, lng: p.lng })),
  };
}

/** Mean of the non-null values of every dataset along the stops. */
export function meanValues(stops: VinylStop[]): Record<string, number> {
  const sum: Record<string, { total: number; n: number }> = {};
  for (const s of stops) {
    for (const [id, v] of Object.entries(s.values)) {
      if (v === null || v === undefined || !Number.isFinite(v)) continue;
      const acc = (sum[id] ??= { total: 0, n: 0 });
      acc.total += v;
      acc.n += 1;
    }
  }
  return Object.fromEntries(Object.entries(sum).map(([id, { total, n }]) => [id, total / n]));
}

/** One groove of the record. */
export async function fetchVinylChunk(
  req: VinylRequest,
  signal?: AbortSignal,
  deps: VinylDeps = DEFAULT_DEPS
): Promise<VinylResponse> {
  const center = clampCenter(req.center);
  const k = Math.max(0, Math.min(VINYL_CHUNKS - 1, Math.floor(req.chunk_index)));
  const g = await deps.fetchGroove(buildGrooveRequest(center, k, req.time_period, req.dataset_ids), signal);
  return {
    dataset_ids: g.dataset_ids,
    time_period: req.time_period,
    center,
    chunk_index: k,
    next_chunk_index: k + 1 < VINYL_CHUNKS ? k + 1 : null,
    chunk_count: VINYL_CHUNKS,
    stops: g.stops,
    stop_seconds: g.stop_seconds,
    radius_deg: g.radius_deg,
    audio_data: g.audio_data,
    values: meanValues(g.stops),
  };
}

// ---------------------------------------------------------------------------
// Bridge to ChunkPlayer
// ---------------------------------------------------------------------------
//
// ChunkPlayer chains chunks by period ("YYYY-MM") and times each one as
// months(time_period -> next_time_period) * 3 s. Groove k is therefore encoded
// as the synthetic period BASE + 10k months: every groove lasts exactly 30 s
// (10 bars) and prefetch (at 20 %, ~24 s ahead), retries and aborts work
// unchanged. These periods never reach the backend.

export const VINYL_BASE_PERIOD = '2000-01';
const MONTHS_PER_CHUNK = BARS_PER_CHUNK;
/** endPeriod for the player: the last groove then also lasts 10 months = 30 s */
export const VINYL_END_PERIOD = addMonths(VINYL_BASE_PERIOD, VINYL_CHUNKS * MONTHS_PER_CHUNK - 1);
const BASE_YEAR = periodToYear(VINYL_BASE_PERIOD);

export function syntheticPeriod(k: number): string {
  return addMonths(VINYL_BASE_PERIOD, k * MONTHS_PER_CHUNK);
}

/** Groove of a synthetic period (a period inside a groove maps to that groove). */
export function chunkIndexOf(period: string): number {
  const months = monthsBetween(VINYL_BASE_PERIOD, period);
  if (!Number.isFinite(months)) return 0;
  return Math.max(0, Math.min(VINYL_CHUNKS - 1, Math.floor(months / MONTHS_PER_CHUNK)));
}

/** Progress over the side (0..1) of a player position (fractional synthetic year). */
export function progressOfPosition(position: number | null): number {
  if (position === null || !Number.isFinite(position)) return 0;
  const months = (position - BASE_YEAR) * 12;
  return Math.max(0, Math.min(1, months / (VINYL_CHUNKS * MONTHS_PER_CHUNK)));
}

export interface VinylChunkMeta {
  chunkIndex: number;
  nextChunkIndex: number | null;
  center: LatLng;
  /** The real month played */
  timePeriod: string;
  stops: VinylStop[];
  stopSeconds: number;
  radiusDeg: number;
  /** Mean along the groove, per dataset_id (announcements, table) */
  values: Record<string, number>;
}

export type VinylPlayerChunk = ZoneDataResponse & { vinyl: VinylChunkMeta };

export function isVinylChunk(r: ZoneDataResponse): r is VinylPlayerChunk {
  return typeof (r as Partial<VinylPlayerChunk>).vinyl === 'object' && (r as VinylPlayerChunk).vinyl !== null;
}

export interface VinylConfig {
  timePeriod: string;
  center: LatLng;
}

/**
 * A ChunkFetcher for ChunkPlayer: turns the player's (synthetic) period into a
 * groove request and the vinyl answer back into a zone-data-shaped chunk.
 * `getConfig` is read on every request, so the latest centre and month are used.
 */
export function makeVinylChunkFetcher(
  getConfig: () => VinylConfig,
  fetchVinyl: (req: VinylRequest, signal?: AbortSignal) => Promise<VinylResponse> = fetchVinylChunk
): ChunkFetcher {
  return async (req, signal) => {
    const { timePeriod, center } = getConfig();
    const v = await fetchVinyl(
      { dataset_ids: req.dataset_ids, time_period: timePeriod, center, chunk_index: chunkIndexOf(req.time_period) },
      signal
    );
    const chunk: VinylPlayerChunk = {
      zone_id: null,
      dataset_ids: v.dataset_ids,
      time_period: syntheticPeriod(v.chunk_index),
      next_time_period: v.next_chunk_index === null ? null : syntheticPeriod(v.next_chunk_index),
      audio_data: v.audio_data,
      values: v.values,
      point_count: v.stops.length,
      vinyl: {
        chunkIndex: v.chunk_index,
        nextChunkIndex: v.next_chunk_index,
        center: v.center,
        timePeriod: v.time_period,
        stops: v.stops,
        stopSeconds: v.stop_seconds,
        radiusDeg: v.radius_deg,
        values: v.values,
      },
    };
    return chunk;
  };
}
