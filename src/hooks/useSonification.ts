import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ChunkPlayer, type PlayerState } from '../audio/ChunkPlayer';
import {
  ApiError,
  periodYear,
  periodToYear,
  yearToPeriod,
  withMonth,
  monthOccurrence,
  snapToMonth,
  type ApiErrorKind,
} from '../services/sonificationApi';
import type { GridPoint } from '../types/zones';
import type { Track, TrackState } from '../types/tracks';
import { isAnomalyUnits } from '../utils/reading';
import { monthKey } from '../services/volumeData';
import { splitFractionalYear } from '../utils/formatDate';
import { createPositionStore, usePlaybackPosition } from './usePlaybackPosition';
import { useLocalStorageString } from './useLocalStorageString';

/** localStorage key of the month travel choice ("" = every month, "1".."12") */
export const MONTH_TRAVEL_KEY = 'earth-jukebox-month-travel';

/** Saved month travel value -> 1..12, or null (every month) for anything else. */
export function parseMonthFilter(saved: string | null): number | null {
  const n = Number(saved);
  return saved && Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
}

/**
 * "YYYY_MM" of the globe frame for a position. In month travel the playhead
 * crosses one year per bar, so the frame stays on that month's occurrence.
 */
export function frameMonthKey(position: number, month: number | null): string {
  if (month) {
    const [y] = monthOccurrence(position, month).split('-');
    return monthKey(Number(y), month);
  }
  const { year, month: m } = splitFractionalYear(position);
  return monthKey(year, m);
}

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
  /** Music style id (useMusicStyle); a change restarts the audio from the current position */
  genre?: string;
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
    // end of the last month of data (last_time_period is the START of that month),
    // so progress and seek(1) reach the final month
    fractionalEnd: picked.endRaw + 1 / 12,
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

/**
 * Position, timeline progress (0..1) and displayed year from the raw store value.
 * In month travel (`month` 1..12), `datePosition` is the date being heard
 * (that month's occurrence), while `position` keeps moving for the playhead.
 */
export function derivePlayback(
  raw: number | null,
  yearRange: { start: number; end: number },
  timelineEnd: number,
  month: number | null = null
) {
  const position = raw ?? yearRange.start;
  const span = timelineEnd - yearRange.start;
  const progress = span > 0 ? Math.min(1, Math.max(0, (position - yearRange.start) / span)) : 0;
  const datePosition = snapToMonth(position, month);
  // Same rounding as the displayed date (splitFractionalYear) so year, month and label agree
  const currentYear = Math.min(yearRange.end, splitFractionalYear(datePosition).year);
  return { position, progress, currentYear, datePosition };
}

const SEEK_DEBOUNCE_MS = 250;

/**
 * Connects the UI to the backend sonification (via ChunkPlayer).
 *
 * The player owns playback; this hook mirrors its state for React and maps the
 * year-based timeline (seek/seekToYear/progress) onto backend periods.
 */
export function useSonification({ tracks, points, zoneId, zoneName, genre }: UseSonificationOptions) {
  const playerRef = useRef<ChunkPlayer | null>(null);
  const [playerState, setPlayerState] = useState<PlayerState>('idle');
  // Fine position lives outside React state (updates ~10x/s): see usePlaybackPosition
  const [positionStore] = useState(() => createPositionStore());
  const [error, setError] = useState<SonificationError | null>(null);
  const [hasEnded, setHasEnded] = useState(false);
  // Paused by the system (iOS interruption), not by the user: announced to screen readers
  const [interrupted, setInterrupted] = useState(false);
  // Values (per dataset_id) of the chunk that is audible now
  const [chunk, setChunk] = useState<{
    values: Record<string, number>;
    year: number | null;
  }>({ values: {}, year: null });

  // Month travel: null = every month, 1..12 = only that month, through the years
  const [savedMonth, saveMonth] = useLocalStorageString(MONTH_TRAVEL_KEY);
  const monthFilter = parseMonthFilter(savedMonth);
  const monthFilterRef = useRef(monthFilter);
  monthFilterRef.current = monthFilter;
  const setMonthFilter = useCallback(
    (month: number | null) => saveMonth(month === null ? '' : String(month)),
    [saveMonth]
  );

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
  // Where the last chunk ends: the latest data of the enabled tracks
  const endPeriod = useMemo(
    () =>
      tracks
        .filter((t) => datasetIds.includes(t.id) && t.period)
        .map((t) => t.period!.end)
        .sort()
        .at(-1) ?? null,
    [tracks, datasetIds]
  );

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
      if (!seekTimer.current) positionStore.set(p);
    };
    player.onStateChange = (s) => setPlayerState(s);
    player.onChunk = (r) => {
      setError(null);
      setChunk({ values: r.values ?? {}, year: periodYear(r.time_period) });
    };
    player.onError = (err) => {
      setError({
        kind: err instanceof ApiError ? err.kind : 'unknown',
        detail: err instanceof ApiError ? err.detail : err.message,
      });
    };
    player.onInterrupted = () => setInterrupted(true);
    player.onComplete = () => {
      setHasEnded(true);
      positionStore.set(rangeRef.current.fractionalEnd);
    };
    playerRef.current = player;
    return () => {
      if (seekTimer.current) clearTimeout(seekTimer.current);
      seekTimer.current = null;
      player.dispose();
      playerRef.current = null;
    };
  }, [positionStore]);

  // Zone / tracks -> player (restarts from the current position when playing)
  useEffect(() => {
    playerRef.current?.setParams({ zoneId, zoneName, points, datasetIds, endPeriod, genre, month: monthFilter });
    // datasetKey stands for datasetIds
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneId, zoneName, points, datasetKey, endPeriod, genre, monthFilter]);

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
    setInterrupted(false);
    flushSeek();
    const first = `${rangeRef.current.start}-01`;
    // Month travel starts at that month of the first year (the player snaps any period too)
    const month = monthFilterRef.current;
    await playerRef.current?.play(month ? withMonth(first, month) : first);
  }, [flushSeek]);

  const pause = useCallback(() => playerRef.current?.pause(), []);

  const stop = useCallback(() => {
    setHasEnded(false);
    positionStore.set(null);
    if (seekTimer.current) clearTimeout(seekTimer.current);
    seekTimer.current = null;
    playerRef.current?.stop();
  }, [positionStore]);

  const seekToYear = useCallback((year: number) => {
    const { start, fractionalEnd } = rangeRef.current;
    const target = Math.min(fractionalEnd - 1 / 24, Math.max(start, year));
    setError(null);
    setHasEnded(false);
    // The timeline moves at once; the backend is asked once the user stops dragging
    positionStore.set(target);
    seekTarget.current = target;
    if (seekTimer.current) clearTimeout(seekTimer.current);
    seekTimer.current = setTimeout(() => {
      seekTimer.current = null;
      playerRef.current?.seek(yearToPeriod(seekTarget.current));
    }, SEEK_DEBOUNCE_MS);
  }, [positionStore]);

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

  // Seek waiting for a track change: the timeline range (and so the clamp in
  // seekToYear) depends on the enabled tracks, so it must run after they apply
  const pendingSeek = useRef<number | null>(null);
  useEffect(() => {
    if (pendingSeek.current === null) return;
    const year = pendingSeek.current;
    pendingSeek.current = null;
    seekToYear(year);
  }, [datasetKey, seekToYear]);

  /**
   * Enable exactly `trackIds` (the unavailable ones are skipped; if none is
   * available the selection is kept), then move the timeline to `year`.
   */
  const jumpTo = useCallback(
    (trackIds: string[], year: number) => {
      const wanted = trackIds.filter((id) => tracks.some((t) => t.id === id && t.available));
      const nextKey = tracks.filter((t) => wanted.includes(t.id)).map((t) => t.id).join(',');
      if (wanted.length === 0 || nextKey === datasetKey) {
        seekToYear(year);
        return;
      }
      pendingSeek.current = year;
      setUserEnabled(new Set(wanted));
    },
    [tracks, datasetKey, seekToYear]
  );

  const mainTrackId = datasetIds.find((id) => chunk.values[id] !== undefined) ?? null;
  const currentValue = mainTrackId ? chunk.values[mainTrackId] : null;
  const units = tracks.find((t) => t.id === mainTrackId)?.units ?? null;

  // Coarse subscriptions only: re-render on year (~36 s) / month (~3 s) changes
  const currentYear = usePlaybackPosition(
    positionStore,
    (raw) => derivePlayback(raw, yearRange, timelineEnd, monthFilter).currentYear
  );
  const playbackMonthKey = usePlaybackPosition(positionStore, (raw) =>
    frameMonthKey(raw ?? yearRange.start, monthFilter)
  );
  const status: SonificationStatus =
    playerState === 'paused' ? 'idle' : playerState;

  return {
    // Playback state
    status,
    isPlaying: playerState === 'playing' || playerState === 'loading',
    error,
    hasEnded,
    interrupted,
    canPlay,
    /** Fine playback position (fractional year, ~10 Hz): subscribe with usePlaybackPosition */
    positionStore,
    /** Whole year of the position (changes ~every 36 s) */
    currentYear,
    /** "YYYY_MM" of the position (changes ~every 3 s; in month travel, always the chosen month) */
    playbackMonthKey,
    /** Month travel: 1..12 = only that month through the years, null = every month */
    monthFilter,
    setMonthFilter,
    yearRange,
    /** Right edge of the timeline: fractional year of the month after the last data */
    timelineEnd,

    // Latest value reported by the backend
    /** Track the announced value belongs to: the first enabled track with a value */
    mainTrackId,
    currentValue,
    /** Values of every enabled track for the current chunk, by dataset_id */
    chunkValues: chunk.values,
    units,
    isAnomaly: isAnomalyUnits(units),
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
    /** Select exactly these tracks, then seek (once their date range applies) */
    jumpTo,
  };
}

export default useSonification;
