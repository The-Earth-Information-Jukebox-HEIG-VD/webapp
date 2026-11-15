/**
 * Sonification API client.
 *
 * Talks to the deployed backend (contract: sonification/backend/FRONTEND_API.md, v2.5):
 *   GET  /api/instruments       which instrument plays which dataset
 *   GET  /api/health            server status
 *   POST /api/zones/zone-data   selected points + one period in, 30 s of audio out
 *   POST /api/zones/series      full monthly series of the selected area, for the data graph
 *
 * The embedded base64 `audio_data` is played as is. The selected points are sent
 * as a compact `mask` (utils/zoneMask.ts) when the browser can build one.
 */

import type { GridPoint } from '../types/zones';
import { maskFor } from '../utils/zoneMask';

export const API_BASE = import.meta.env.VITE_API_URL || '/api';

// ---------------------------------------------------------------------------
// Types (exactly the shapes the live server returns)
// ---------------------------------------------------------------------------

export interface ZoneDataRequest {
  zone_id: string | null;
  zone_name: string | null;
  /** dataset_id of every track to combine into one piece */
  dataset_ids: string[];
  /** Sent as a `mask` when possible, else unchanged (the backend uses lat/lng, ignores x/y) */
  points: GridPoint[];
  /** "YYYY-MM" */
  time_period: string;
  /** Only "mean" exists; anything else is a 422 */
  aggregation: 'mean';
}

export interface ZoneDataResponse {
  zone_id: string | null;
  /** The datasets that were actually combined (those without data are left out) */
  dataset_ids: string[];
  /** Where the music really starts (later than requested if before the data) */
  time_period: string;
  /** Period to request next; null when the data ends */
  next_time_period: string | null;
  /** Base64 MP3 */
  audio_data: string;
  /** Mean over the points at time_period, per dataset_id, in the units of /api/instruments */
  values: Record<string, number>;
  point_count: number;
}

export interface ZoneSeriesRequest {
  zone_id: string | null;
  zone_name: string | null;
  dataset_ids: string[];
  points: GridPoint[];
  /** Only "mean" exists */
  aggregation: 'mean';
}

export interface DatasetSeries {
  units: string | null;
  /** The values are departures from normal */
  anomaly: boolean;
  /** "YYYY-MM": month of values[0] */
  start: string;
  /** One value per year (stored in the January slot of each year) */
  yearly: boolean;
  /** values[i] is the month `start + i`; null = no data */
  values: (number | null)[];
}

export interface ZoneSeriesResponse {
  zone_id: string | null;
  step: 'month';
  point_count: number;
  series: Record<string, DatasetSeries>;
  /** Requested datasets the server has no data for */
  missing: string[];
}

export interface InstrumentInfo {
  dataset_id: string;
  /** Display name, e.g. "Temperature" */
  name: string;
  instrument: string;
  /** e.g. "degC anomaly", "ppm", "mm/day", "brightness (0-1)" */
  units: string;
  /** "YYYY-MM" */
  first_time_period: string;
  last_time_period: string;
  midi_program: number;
  pitch_range: [number, number];
  role: string;
  always_playing: boolean;
}

export interface InstrumentsResponse {
  palette: string;
  by_dataset: Record<string, string>;
  instruments: InstrumentInfo[];
}

export interface HealthResponse {
  status: string;
  version?: string;
  datasets?: number;
  preparing_data?: boolean;
  full_api?: boolean;
  audio_rendering?: boolean;
  mp3_encoding?: boolean;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Which localized message to show (errors.<kind> in common.json). */
export type ApiErrorKind = 'backendUnavailable' | 'serverPreparing' | 'noDataForPeriod' | 'unknown';

export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;
  readonly kind: ApiErrorKind;

  constructor(status: number, detail: string, kind: ApiErrorKind) {
    super(detail || `API error ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
    this.kind = kind;
  }
}

/** Read the FastAPI `detail`, which is a string or a 422 list of `{loc, msg}`. */
export function parseErrorDetail(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        if (d && typeof d === 'object' && 'msg' in d) {
          const { loc, msg } = d as { loc?: unknown[]; msg: unknown };
          const where = Array.isArray(loc) && loc.length > 0 ? `${loc.join('.')}: ` : '';
          return `${where}${String(msg)}`;
        }
        return String(d);
      })
      .join('; ');
  }
  return '';
}

function classify(status: number, hasDetail: boolean): ApiErrorKind {
  if (status === 0) return 'backendUnavailable';
  if (status === 503 && hasDetail) return 'serverPreparing';
  if (status >= 500 && !hasDetail) return 'backendUnavailable'; // proxy error page
  if (status === 502 || status === 504) return 'backendUnavailable';
  // FastAPI always answers 404 with a JSON detail; a bare 404 means another
  // server (static hosting, docs preview…) is answering on the API URL
  if (status === 404 && !hasDetail) return 'backendUnavailable';
  if (status === 400 || status === 404 || status === 422) return 'noDataForPeriod';
  return 'unknown';
}

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException
    ? err.name === 'AbortError'
    : typeof err === 'object' && err !== null && (err as { name?: string }).name === 'AbortError';
}

async function request<T>(path: string, init: RequestInit, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, signal });
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw new ApiError(0, err instanceof Error ? err.message : 'Network error', 'backendUnavailable');
  }

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const detail = parseErrorDetail(body);
    throw new ApiError(response.status, detail, classify(response.status, detail !== ''));
  }

  try {
    return (await response.json()) as T;
  } catch {
    // 200 with a non-JSON body: no API behind this URL (e.g. static hosting)
    throw new ApiError(response.status, 'Invalid response', 'backendUnavailable');
  }
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/**
 * The JSON body of a request on an area: `points` replaced by the same cells as a
 * `mask` (a few kB instead of up to 14 MB, re-sent with every chunk), or the
 * points unchanged when no mask can be built.
 */
export async function areaBody(req: ZoneDataRequest | ZoneSeriesRequest): Promise<string> {
  const mask = await maskFor(req.points);
  if (mask === null) return JSON.stringify(req);
  const body: Record<string, unknown> = { ...req, mask };
  delete body.points;
  return JSON.stringify(body);
}

export async function fetchZoneData(req: ZoneDataRequest, signal?: AbortSignal): Promise<ZoneDataResponse> {
  return request<ZoneDataResponse>(
    '/zones/zone-data',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: await areaBody(req),
    },
    signal
  );
}

export async function fetchZoneSeries(req: ZoneSeriesRequest, signal?: AbortSignal): Promise<ZoneSeriesResponse> {
  return request<ZoneSeriesResponse>(
    '/zones/series',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: await areaBody(req),
    },
    signal
  );
}

export function fetchInstruments(signal?: AbortSignal): Promise<InstrumentsResponse> {
  return request<InstrumentsResponse>('/instruments', { method: 'GET' }, signal);
}

export function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return request<HealthResponse>('/health', { method: 'GET' }, signal);
}

// ---------------------------------------------------------------------------
// Time period helpers ("YYYY", "YYYY-MM", "YYYY-MM-DD", or an ISO timestamp)
// ---------------------------------------------------------------------------

/** Fractional year of a period string, e.g. "1950-07" -> 1950.5. */
export function periodToYear(period: string): number {
  const m = /^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/.exec(period.trim());
  if (!m) return NaN;
  const year = Number(m[1]);
  if (m[2] === undefined) return year;
  const month = Number(m[2]) - 1;
  if (m[3] === undefined) return year + month / 12;
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  return year + (Date.UTC(year, month, Number(m[3])) - start) / (end - start);
}

/** "YYYY-MM" period for a fractional year (floored to the month). */
export function yearToPeriod(fractionalYear: number): string {
  const year = Math.floor(fractionalYear);
  const month = Math.min(12, Math.floor((fractionalYear - year) * 12 + 1e-9) + 1);
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Integer year of a period string or ISO timestamp, or null when unparseable. */
export function periodYear(period: string | null | undefined): number | null {
  if (!period) return null;
  const y = periodToYear(period);
  return Number.isNaN(y) ? null : Math.floor(y);
}

/** Whole months from period `a` to period `b` ("YYYY-MM"); negative if b is earlier. */
export function monthsBetween(a: string, b: string): number {
  const ma = /^(\d{4})-(\d{1,2})/.exec(a);
  const mb = /^(\d{4})-(\d{1,2})/.exec(b);
  if (!ma || !mb) return NaN;
  return (Number(mb[1]) - Number(ma[1])) * 12 + (Number(mb[2]) - Number(ma[2]));
}

/** Period `n` months after `period` ("YYYY-MM"). */
export function addMonths(period: string, n: number): string {
  const m = /^(\d{4})-(\d{1,2})/.exec(period);
  if (!m) return period;
  const total = Number(m[1]) * 12 + (Number(m[2]) - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** Decode a base64 string to an ArrayBuffer. */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
