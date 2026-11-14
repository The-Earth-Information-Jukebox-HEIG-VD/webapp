import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ChunkPlayer, type PlayerState } from '../audio/ChunkPlayer';
import { ApiError, periodYear, periodToYear, yearToPeriod, type ApiErrorKind } from '../services/sonificationApi';
import type { GridPoint } from '../types/zones';
import type { Track, TrackState } from '../types/tracks';

export const DEFAULT_YEAR_RANGE = { start: 1880, end: 2025 };

export type SonificationStatus = 'idle' | 'loading' | 'playing' | 'error';

export interface SonificationError {
  kind: ApiErrorKind;
  /** Raw backend detail, for display next to the localized message */
  detail: string;
}

export interface UseSonificationOptions {
  /** Tracks from useInstruments() */
  tracks: Track[];
  points: GridPoint[];
  zoneId: string | null;
  zoneName: string | null;
}

function pickRange(list: Track[]) {
  let start = Infinity;
  let end = -Infinity;
  for (const t of list) {
    const s = periodToYear(t.period?.start ?? '');
    const e = periodToYear(t.period?.end ?? '');
    if (!Number.isNaN(s)) start = Math.min(start, s);
    if (!Number.isNaN(e)) end = Math.max(end, e);
  }
  return Number.isFinite(start) && Number.isFinite(end) && end > start
    ? { start: Math.floor(start), endRaw: end }
    : null;
}

function timelineOf(tracks: Track[], enabledIds: ReadonlySet<string>) {
  const picked = pickRange(tracks.filter((t) => enabledIds.has(t.id))) ?? pickRange(tracks);
  if (!picked) return { start: DEFAULT_YEAR_RANGE.start, end: DEFAULT_YEAR_RANGE.end, fractionalEnd: DEFAULT_YEAR_RANGE.end + 1 };
  return {
    start: picked.start,
    end: Math.floor(picked.endRaw),
    // end of the last month of data, so progress and seek(1) reach the final months
    fractionalEnd: Math.ceil(picked.endRaw * 12) / 12,
  };
}

/** Overall timeline of the enabled tracks, in whole years (for labels and markers). */
export function computeYearRange(tracks: Track[], enabledIds: ReadonlySet<string>) {
  const { start, end } = timelineOf(tracks, enabledIds);
  return { start, end };
}

/** End of the timeline as a fractional year (end of the last month of data). */
export function computeTimelineEnd(tracks: Track[], enabledIds: ReadonlySet<string>): number {
  return timelineOf(tracks, enabledIds).fractionalEnd;
}

const SEEK_DEBOUNCE_MS = 250;

/**
 * Connects the UI to the backend sonification (via ChunkPlayer).
 *
 * The player owns playback; this hook mirrors its state for React and maps the
 * year-based timeline (seek/seekToYear/progress) onto backend periods.
 */
export function useSonification({ tracks, points, zoneId, zoneName }: UseSonificationOptions) {
  const playerRef = useRef<ChunkPlayer | null>(null);
  const [playerState, setPlayerState] = useState<PlayerState>('idle');
  const [position, setPosition] = useState<number | null>(null);
  const [error, setError] = useState<SonificationError | null>(null);
  const [hasEnded, setHasEnded] = useState(false);
  const [chunk, setChunk] = useState<{
    value: number | null;
    units: string | null;
    anomaly: boolean;
    year: number | null;
  }>({ value: null, units: null, anomaly: false, year: null });

  // null = user has not touched the selection yet: use each track's default
  const [userEnabled, setUserEnabled] = useState<Set<string> | null>(null);

  const enabledIds = useMemo(
    () =>
      userEnabled ??
      new Set(tracks.filter((t) => t.defaultEnabled && t.available).map((t) => t.id)),
    [userEnabled, tracks]
  );
  // Same order as the track list so the dataset_id array is stable
  const datasetIds = useMemo(
    () => tracks.filter((t) => enabledIds.has(t.id) && t.available).map((t) => t.id),
    [tracks, enabledIds]
  );
  const datasetKey = datasetIds.join(',');

  const yearRange = useMemo(() => computeYearRange(tracks, enabledIds), [tracks, enabledIds]);
  const timelineEnd = useMemo(() => computeTimelineEnd(tracks, enabledIds), [tracks, enabledIds]);
  const rangeRef = useRef({ ...yearRange, fractionalEnd: timelineEnd });
  rangeRef.current = { ...yearRange, fractionalEnd: timelineEnd };
  // Set while a (debounced) seek is waiting: the player's own progress must not override it
  const seekTarget = useRef(0);
  const seekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trackStates: TrackState[] = useMemo(
    () => tracks.map((t) => ({ id: t.id, enabled: enabledIds.has(t.id) && t.available })),
    [tracks, enabledIds]
  );

  // Player lifecycle
  useEffect(() => {
    const player = new ChunkPlayer();
    player.onProgress = ({ position: p }) => {
      if (!seekTimer.current) setPosition(p);
    };
    player.onStateChange = (s) => setPlayerState(s);
    player.onChunk = (r) => {
      setError(null);
      setChunk({
        value: r.value,
        units: r.units,
        anomaly: r.anomaly,
        year: periodYear(r.time_period),
      });
    };
    player.onError = (err) => {
      setError({
        kind: err instanceof ApiError ? err.kind : 'unknown',
        detail: err instanceof ApiError ? err.detail : err.message,
      });
    };
    player.onComplete = () => {
      setHasEnded(true);
      setPosition(rangeRef.current.fractionalEnd);
    };
    playerRef.current = player;
    return () => {
      if (seekTimer.current) clearTimeout(seekTimer.current);
      seekTimer.current = null;
      player.dispose();
      playerRef.current = null;
    };
  }, []);

  // Zone / tracks -> player (restarts from the current position when playing)
  useEffect(() => {
    playerRef.current?.setParams({ zoneId, zoneName, points, datasetIds });
    // datasetKey stands for datasetIds
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneId, zoneName, points, datasetKey]);

  const canPlay = datasetIds.length > 0 && points.length > 0;

  /** Apply a seek that is still waiting for its debounce */
  const flushSeek = useCallback(() => {
    if (!seekTimer.current) return;
    clearTimeout(seekTimer.current);
    seekTimer.current = null;
    playerRef.current?.seek(yearToPeriod(seekTarget.current));
  }, []);

  const play = useCallback(async () => {
    setError(null);
    setHasEnded(false);
    flushSeek();
    await playerRef.current?.play(`${rangeRef.current.start}-01`);
  }, [flushSeek]);

  const pause = useCallback(() => playerRef.current?.pause(), []);

  const stop = useCallback(() => {
    setHasEnded(false);
    setPosition(null);
    if (seekTimer.current) clearTimeout(seekTimer.current);
    seekTimer.current = null;
    playerRef.current?.stop();
  }, []);

  const seekToYear = useCallback((year: number) => {
    const { start, fractionalEnd } = rangeRef.current;
    const target = Math.min(fractionalEnd - 1 / 24, Math.max(start, year));
    setError(null);
    setHasEnded(false);
    // The timeline moves at once; the backend is asked once the user stops dragging
    setPosition(target);
    seekTarget.current = target;
    if (seekTimer.current) clearTimeout(seekTimer.current);
    seekTimer.current = setTimeout(() => {
      seekTimer.current = null;
      playerRef.current?.seek(yearToPeriod(seekTarget.current));
    }, SEEK_DEBOUNCE_MS);
  }, []);

  const seek = useCallback(
    (progress: number) => {
      const { start, fractionalEnd } = rangeRef.current;
      seekToYear(start + Math.min(1, Math.max(0, progress)) * (fractionalEnd - start));
    },
    [seekToYear]
  );

  const setVolume = useCallback((volume: number) => playerRef.current?.setVolume(volume), []);

  const setTrackEnabled = useCallback(
    (trackId: string, enabled: boolean) => {
      setUserEnabled((prev) => {
        const next = new Set(
          prev ?? tracks.filter((t) => t.defaultEnabled && t.available).map((t) => t.id)
        );
        if (enabled) next.add(trackId);
        else next.delete(trackId);
        return next;
      });
    },
    [tracks]
  );

  const currentPosition = position ?? yearRange.start;
  const span = timelineEnd - yearRange.start;
  const progress = span > 0 ? Math.min(1, Math.max(0, (currentPosition - yearRange.start) / span)) : 0;
  const status: SonificationStatus =
    playerState === 'paused' ? 'idle' : playerState;

  return {
    // Playback state
    status,
    isPlaying: playerState === 'playing' || playerState === 'loading',
    error,
    hasEnded,
    canPlay,
    /** Current date as a fractional year (e.g. 1950.25), interpolated within the chunk */
    position: currentPosition,
    currentYear: Math.min(yearRange.end, Math.floor(currentPosition)),
    progress,
    yearRange,

    // Latest value reported by the backend
    currentValue: chunk.value,
    units: chunk.units,
    isAnomaly: chunk.anomaly,
    /** Year the current chunk started at (changes every ~30 s, for announcements) */
    chunkYear: chunk.year,

    // Tracks
    trackStates,

    // Controls
    play,
    pause,
    /** Retry after an error: starts again from the position where it failed */
    retry: play,
    stop,
    seek,
    seekToYear,
    setVolume,
    setTrackEnabled,
  };
}

export default useSonification;
