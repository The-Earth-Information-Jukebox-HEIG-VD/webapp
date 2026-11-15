import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchHealth,
  fetchInstruments,
  isAbortError,
  clipPeriodRange,
  ApiError,
  type ApiErrorKind,
  type InstrumentInfo,
} from '../services/sonificationApi';
import type { Track } from '../types/tracks';
import {
  TRACK_COLORS,
  FALLBACK_TRACK_COLOR,
  canonicalTrackId,
  trackColor,
  type TrackSurface,
} from '../data/trackColors';

export { TRACK_COLORS, FALLBACK_TRACK_COLOR };

/** Tracks switched on before the user chooses. */
const DEFAULT_ENABLED = new Set(['temperature']);

/** Map one backend instrument row to a UI track; its colour is the palette for `surface`. */
export function instrumentToTrack(info: InstrumentInfo, surface: TrackSurface = 'dark'): Track {
  return {
    id: info.dataset_id,
    // Aliases (e.g. ndvi -> vegetation) share the canonical name key
    nameKey: `tracks.${canonicalTrackId(info.dataset_id)}`,
    label: info.name,
    instrument: info.instrument,
    role: info.role,
    // The server lists only datasets it has data for
    available: true,
    alwaysPlaying: info.always_playing,
    units: info.units,
    // The app starts in 1920 (APP_FIRST_PERIOD): every timeline reads this period
    period:
      info.first_time_period && info.last_time_period
        ? clipPeriodRange(info.first_time_period, info.last_time_period)
        : null,
    color: trackColor(info.dataset_id, surface),
    defaultEnabled: DEFAULT_ENABLED.has(info.dataset_id),
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
 * "server is preparing data" flag) once, and again on reload() or when the music
 * style changes (the instrument names depend on it; the list stays visible meanwhile).
 * `surface` picks the data palette (light page theme or dark); changing it only
 * recolours the tracks, it does not reload.
 */
export function useInstruments(genre?: string, surface: TrackSurface = 'dark'): UseInstrumentsResult {
  const [infos, setInfos] = useState<InstrumentInfo[]>([]);
  const tracks = useMemo(() => infos.map((info) => instrumentToTrack(info, surface)), [infos, surface]);
  const [status, setStatus] = useState<InstrumentsStatus>('loading');
  const [preparing, setPreparing] = useState(false);
  const [errorKind, setErrorKind] = useState<ApiErrorKind | null>(null);
  const [attempt, setAttempt] = useState(0);
  const loadedRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    // A style change keeps the list on screen while the new names load
    if (!loadedRef.current) setStatus('loading');
    setErrorKind(null);

    Promise.all([
      fetchInstruments(genre, controller.signal),
      // Health is informative only; never fail the list because of it
      fetchHealth(controller.signal).catch((err) => {
        if (isAbortError(err)) throw err;
        return null;
      }),
    ])
      .then(([instruments, health]) => {
        setInfos(instruments.instruments);
        setPreparing(health?.preparing_data ?? false);
        loadedRef.current = true;
        setStatus('ready');
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        setErrorKind(err instanceof ApiError ? err.kind : 'unknown');
        loadedRef.current = false;
        setStatus('error');
      });

    return () => controller.abort();
  }, [attempt, genre]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  return { tracks, status, preparing, errorKind, reload };
}

export default useInstruments;
