/**
 * Sonification API client.
 *
 * Talks to the backend described in sonification/backend/API.md (v1.9):
 *   GET  /api/instruments  which instrument plays which dataset
 *   GET  /api/health       server status
 *   POST /api/sonify       selected points + one period in, 30 s of audio out
 *
 * The embedded base64 `audio_data` is always used, never `audio_url`: the URL is
 * built from the backend's own Host header and may be unreachable behind nginx.
 */

import type { GridPoint } from '../types/zones';

export const API_BASE = import.meta.env.VITE_API_URL || '/api';

// ---------------------------------------------------------------------------
// Types (mirror API.md)
// ---------------------------------------------------------------------------

export interface SonifyRequest {
  zone_id?: string | null;
  zone_name?: string | null;
  /** One id or several (played together). Omitted/"all" plays the whole orchestra. */
  dataset_id?: string | string[];
  points?: GridPoint[];
  /** "YYYY", "YYYY-MM" or "YYYY-MM-DD". Omitted = first date of the data. */
  time_period?: string;
  /** Only "mean" exists; anything else is a 422. */
  aggregation?: 'mean';
  duration_s?: number;
  audio_format?: 'mp3' | 'wav';
  embed_audio?: boolean;
  options?: Record<string, unknown>;
}

export interface SonifyResponse {
  zone_id: string | null;
  zone_name: string | null;
  dataset_id: string | string[] | null;
  /** The date the music really starts at (can be later than requested). */
  time_period: string | null;
  /** Period right after this chunk; null at the end of the data. */
  next_time_period: string | null;
  /** Base64 of the audio file (null only when embed_audio was false). */
  audio_data: string | null;
  audio_format: 'mp3' | 'wav';
  audio_url: string;
  value: number | null;
  units: string | null;
  values: Record<string, number | null>;
  point_count: number;
  cell_count: number | null;
  aggregation: 'mean';
  /** Last frame played. */
  time_end: string | null;
  /** Seconds of music before the next chunk should start. */
  duration_s: number;
  composition_id: string;
  cached: boolean;
  source_dataset: string;
  source_datasets: Record<string, string> | null;
  real_data: boolean;
  /** true: value is a departure from normal (show "+1.2 °C vs normal"). */
  anomaly: boolean;
}

export interface InstrumentInfo {
  dataset_id: string;
  variable: string;
  label: string;
  instrument: string;
  role: string;
  always_playing: boolean;
  units: string | null;
  available: boolean;
  real_data: boolean;
  /** ISO timestamps, e.g. "1880-01-15T00:00:00Z". */
  time_start: string | null;
  time_end: string | null;
  found_in: string[];
  also_accepted?: string[];
  midi_program: number;
  pitch_range: [number, number];
}

export interface InstrumentsResponse {
  palette: string;
  by_dataset: Record<string, string>;
  instruments: InstrumentInfo[];
}

export interface HealthResponse {
  status: string;
  version: string;
  datasets: number;
  preparing_data: boolean;
  merge_datasets: boolean;
  audio_rendering: boolean;
  mp3_encoding?: boolean;
  orchestral_samples?: boolean;
  data_dir?: string;
  built_dir?: string;
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

export function sonify(req: SonifyRequest, signal?: AbortSignal): Promise<SonifyResponse> {
  return request<SonifyResponse>(
    '/sonify',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aggregation: 'mean', ...req }),
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

/** Decode a base64 string to an ArrayBuffer. */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
