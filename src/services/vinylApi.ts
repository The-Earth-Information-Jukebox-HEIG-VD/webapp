/**
 * Vinyl mode API: the record is played through POST /api/zones/groove
 * (FRONTEND_API.md section 4, API v2.6) or, when travelling through time,
 * POST /api/zones/zone-data.
 *
 * Three ways to travel (the `travel` setting):
 * - space: the date stays fixed, the needle crosses places (groove endpoint);
 * - both: the needle crosses places and the date moves on every groove
 *   (groove endpoint, one date per groove);
 * - time: the needle stays on one place and the months go by (zone-data on a
 *   small disc around the centre, chained with next_time_period).
 *
 * Space/both: for groove k the frontend sends the
 * path the needle crosses (groovePath: 10 bars of 3 s, up to 4 points per bar)
 * and gets back 30 s of music plus one stop per point: stops[i] plays from
 * i * stop_seconds. The groove endpoint has no "next" cursor, the frontend
 * chooses the next stretch (k + 1) itself.
 */
import {
  addMonths,
  fetchGroove,
  fetchZoneData,
  monthsBetween,
  periodToYear,
  type GrooveRequest,
  type GrooveResponse,
  type ZoneDataRequest,
  type ZoneDataResponse,
} from './sonificationApi';
import { monthsElapsed, type ChunkFetcher } from '../audio/ChunkPlayer';
import {
  BARS_PER_CHUNK,
  GROOVE_RADIUS_DEG,
  VINYL_CHUNKS,
  clampCenter,
  discPoints,
  groovePath,
  type LatLng,
} from '../utils/vinylGeometry';
import type { GridPoint } from '../types/zones';

/** What the needle travels through (see useVinylSettings) */
export type VinylTravel = 'space' | 'time' | 'both';
/** Travel 'both': how far the date moves on each groove */
export type VinylStep = 'month' | 'year';

export const STEP_MONTHS: Record<VinylStep, number> = { month: 1, year: 12 };

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
  /** Default 'space'. ('time' is not a groove: see makeVinylChunkFetcher) */
  travel?: VinylTravel;
  /** Travel 'both': months the date moves per groove (default year) */
  step?: VinylStep;
  /** Music style id */
  genre?: string;
  /** Travel 'both': last month the enabled tracks have, "YYYY-MM"; the record ends there */
  range_end?: string;
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
  /** Real months of the groove ("YYYY-MM"); default: [time_period] */
  periods?: string[];
  /** Start second of each month in `periods` (time travel); null: one date for the whole groove */
  bar_starts?: number[] | null;
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
  datasetIds: string[],
  genre?: string
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
    ...(genre ? { genre } : {}),
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

/** Date of groove k when travelling through space and time, kept inside the data. */
export function bothDate(start: string, k: number, step: VinylStep, rangeEnd?: string): string {
  const date = addMonths(start, k * STEP_MONTHS[step]);
  return rangeEnd && date > rangeEnd ? rangeEnd : date;
}

/** One groove of the record (travel 'space' or 'both'). */
export async function fetchVinylChunk(
  req: VinylRequest,
  signal?: AbortSignal,
  deps: VinylDeps = DEFAULT_DEPS
): Promise<VinylResponse> {
  const center = clampCenter(req.center);
  const k = Math.max(0, Math.min(VINYL_CHUNKS - 1, Math.floor(req.chunk_index)));
  const both = req.travel === 'both';
  const step = req.step ?? 'year';
  const date = both ? bothDate(req.time_period, k, step, req.range_end) : req.time_period;
  const g = await deps.fetchGroove(buildGrooveRequest(center, k, date, req.dataset_ids, req.genre), signal);
  // Both: the record ends when the next date would leave the data
  const hasNext =
    k + 1 < VINYL_CHUNKS &&
    (!both || !req.range_end || addMonths(req.time_period, (k + 1) * STEP_MONTHS[step]) <= req.range_end);
  return {
    dataset_ids: g.dataset_ids,
    time_period: date,
    periods: [date],
    bar_starts: null,
    center,
    chunk_index: k,
    next_chunk_index: hasNext ? k + 1 : null,
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
  /** The real month played (the groove's first month in time travel) */
  timePeriod: string;
  travel: VinylTravel;
  /** Real months of the groove: one in space and both, 8-13 in time */
  periods: string[];
  /** Start second of each of `periods` inside the groove (time travel); null: one date throughout */
  barStarts: number[] | null;
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

/** Real month heard `seconds` into the groove (its only month unless time travel). */
export function periodAt(meta: VinylChunkMeta, seconds: number): string {
  const { periods, barStarts } = meta;
  if (periods.length <= 1 || !barStarts || barStarts.length === 0) return periods[0] ?? meta.timePeriod;
  const i = Math.floor(monthsElapsed(barStarts, GROOVE_SECONDS, seconds) + 1e-9);
  return periods[Math.max(0, Math.min(periods.length - 1, i))];
}

/** Period of the record: first and last real month of the grooves heard so far, null if none. */
export function dateSpan(history: Record<number, VinylChunkMeta>): { first: string; last: string } | null {
  const metas = Object.values(history).sort((a, b) => a.chunkIndex - b.chunkIndex);
  if (metas.length === 0) return null;
  const last = metas[metas.length - 1];
  return { first: metas[0].periods[0] ?? metas[0].timePeriod, last: last.periods.at(-1) ?? last.timePeriod };
}

export interface VinylConfig {
  /** Month the record starts at ("YYYY-MM"); the only month in travel 'space' */
  timePeriod: string;
  center: LatLng;
  /** Default 'space' */
  travel?: VinylTravel;
  /** Travel 'both': default 'year' */
  step?: VinylStep;
  genre?: string;
  /** Last month the enabled tracks have */
  rangeEnd?: string;
}

/** Every groove lasts 30 s: BARS_PER_CHUNK bars of 3 s. */
export const GROOVE_SECONDS = BARS_PER_CHUNK * 3;
const SYNTHETIC_BAR_STARTS = Array.from({ length: BARS_PER_CHUNK }, (_, i) => i * 3);

type ZoneFetcher = (req: ZoneDataRequest, signal?: AbortSignal) => Promise<ZoneDataResponse>;

const toGridPoint = (p: LatLng): GridPoint => ({ lat: p.lat, lng: p.lng, x: 0, y: 0 });

/**
 * A ChunkFetcher for ChunkPlayer: turns the player's (synthetic) period into a
 * groove request and the vinyl answer back into a zone-data-shaped chunk.
 * `getConfig` is read on every request, so the latest settings are used.
 *
 * Time travel does not use the groove endpoint: groove k asks zone-data for a
 * small disc around the centre, starting at the real month P_k. The answer's
 * next_time_period is P_(k+1) (remembered here); an unheard groove is estimated
 * as start + 10 k months. next_time_period null ends the side.
 */
export function makeVinylChunkFetcher(
  getConfig: () => VinylConfig,
  fetchVinyl: (req: VinylRequest, signal?: AbortSignal) => Promise<VinylResponse> = fetchVinylChunk,
  fetchZone: ZoneFetcher = fetchZoneData
): ChunkFetcher {
  /** Real first month of each groove heard so far (time travel); reset with the start month */
  const realPeriods = new Map<number, string>();
  let mapStart = '';

  return async (req, signal) => {
    const cfg = getConfig();
    const travel = cfg.travel ?? 'space';
    const k = chunkIndexOf(req.time_period);
    let v: VinylResponse;
    let fromZone: ZoneDataResponse | null = null;

    if (travel === 'time') {
      if (cfg.timePeriod !== mapStart) {
        realPeriods.clear();
        mapStart = cfg.timePeriod;
      }
      const start = realPeriods.get(k) ?? addMonths(cfg.timePeriod, k * BARS_PER_CHUNK);
      const center = clampCenter(cfg.center);
      const z = await fetchZone(
        {
          zone_id: `record-${center.lat.toFixed(1)}_${center.lng.toFixed(1)}`,
          zone_name: null,
          dataset_ids: req.dataset_ids,
          points: discPoints(center).map(toGridPoint),
          time_period: start,
          aggregation: 'mean',
          ...(cfg.genre ? { genre: cfg.genre } : {}),
        },
        signal
      );
      fromZone = z;
      realPeriods.set(k, z.time_period);
      const hasNext = z.next_time_period !== null && k + 1 < VINYL_CHUNKS;
      if (z.next_time_period !== null) realPeriods.set(k + 1, z.next_time_period);
      const months = Math.max(
        1,
        z.bar_starts_s?.length ||
          (z.next_time_period ? monthsBetween(z.time_period, z.next_time_period) : BARS_PER_CHUNK)
      );
      v = {
        dataset_ids: z.dataset_ids,
        time_period: z.time_period,
        periods: Array.from({ length: months }, (_, i) => addMonths(z.time_period, i)),
        bar_starts: z.bar_starts_s?.length
          ? z.bar_starts_s
          : Array.from({ length: months }, (_, i) => (i * GROOVE_SECONDS) / months),
        center,
        chunk_index: k,
        next_chunk_index: hasNext ? k + 1 : null,
        chunk_count: VINYL_CHUNKS,
        stops: [{ lat: center.lat, lng: center.lng, values: z.values }],
        stop_seconds: GROOVE_SECONDS,
        radius_deg: GROOVE_RADIUS_DEG,
        audio_data: z.audio_data,
        values: z.values,
      };
    } else {
      v = await fetchVinyl(
        {
          dataset_ids: req.dataset_ids,
          time_period: cfg.timePeriod,
          center: cfg.center,
          chunk_index: k,
          travel,
          step: cfg.step ?? 'year',
          genre: cfg.genre,
          range_end: cfg.rangeEnd,
        },
        signal
      );
    }

    const chunk: VinylPlayerChunk = {
      zone_id: null,
      dataset_ids: v.dataset_ids,
      time_period: syntheticPeriod(v.chunk_index),
      next_time_period: v.next_chunk_index === null ? null : syntheticPeriod(v.next_chunk_index),
      audio_data: v.audio_data,
      // Every groove claims 30 s of 10 even bars, whatever the real months are
      duration_s: GROOVE_SECONDS,
      bar_starts_s: SYNTHETIC_BAR_STARTS,
      values: v.values,
      point_count: v.stops.length,
      ...(fromZone?.genre ? { genre: fromZone.genre } : {}),
      vinyl: {
        chunkIndex: v.chunk_index,
        nextChunkIndex: v.next_chunk_index,
        center: v.center,
        timePeriod: v.time_period,
        travel,
        periods: v.periods ?? [v.time_period],
        barStarts: v.bar_starts ?? null,
        stops: v.stops,
        stopSeconds: v.stop_seconds,
        radiusDeg: v.radius_deg,
        values: v.values,
      },
    };
    return chunk;
  };
}
