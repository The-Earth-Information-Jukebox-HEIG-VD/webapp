import { useCallback, useEffect, useState } from 'react';
import {
  fetchHealth,
  fetchInstruments,
  isAbortError,
  ApiError,
  type ApiErrorKind,
  type InstrumentInfo,
} from '../services/sonificationApi';
import type { Track } from '../types/tracks';

/** Presentation colour per dataset_id; unknown datasets get the neutral fallback. */
export const TRACK_COLORS: Record<string, string> = {
  temperature: '#e67e22',
  precipitation: '#3498db',
  co2: '#8e44ad',
  dust: '#b7950b',
  smoke: '#7f8c8d',
  lightning: '#f1c40f',
  snowfall: '#5dade2',
};
export const FALLBACK_TRACK_COLOR = '#95a5a6';

/** Tracks switched on before the user chooses. */
const DEFAULT_ENABLED = new Set(['temperature']);

/** Map one backend instrument row to a UI track. */
export function instrumentToTrack(info: InstrumentInfo): Track {
  return {
    id: info.dataset_id,
    nameKey: `tracks.${info.dataset_id}`,
    label: info.label,
    instrument: info.instrument,
    role: info.role,
    available: info.available,
    realData: info.real_data,
    alwaysPlaying: info.always_playing,
    units: info.units,
    period:
      info.time_start && info.time_end ? { start: info.time_start, end: info.time_end } : null,
    color: TRACK_COLORS[info.dataset_id] ?? FALLBACK_TRACK_COLOR,
    defaultEnabled: info.available && DEFAULT_ENABLED.has(info.dataset_id),
  };
}

export type InstrumentsStatus = 'loading' | 'ready' | 'error';

export interface UseInstrumentsResult {
  tracks: Track[];
  status: InstrumentsStatus;
  /** true while the server is still converting raw data at start-up */
  preparing: boolean;
  errorKind: ApiErrorKind | null;
  reload: () => void;
}

/**
 * Loads the track list from GET /api/instruments (and /api/health for the
 * "server is preparing data" flag) once, and again on reload().
 */
export function useInstruments(): UseInstrumentsResult {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [status, setStatus] = useState<InstrumentsStatus>('loading');
  const [preparing, setPreparing] = useState(false);
  const [errorKind, setErrorKind] = useState<ApiErrorKind | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    setErrorKind(null);

    Promise.all([
      fetchInstruments(controller.signal),
      // Health is informative only; never fail the list because of it
      fetchHealth(controller.signal).catch((err) => {
        if (isAbortError(err)) throw err;
        return null;
      }),
    ])
      .then(([instruments, health]) => {
        setTracks(instruments.instruments.map(instrumentToTrack));
        setPreparing(health?.preparing_data ?? false);
        setStatus('ready');
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        setErrorKind(err instanceof ApiError ? err.kind : 'unknown');
        setStatus('error');
      });

    return () => controller.abort();
  }, [attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  return { tracks, status, preparing, errorKind, reload };
}

export default useInstruments;
