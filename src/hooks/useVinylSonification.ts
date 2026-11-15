import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChunkPlayer, type ChunkFetcher, type PlayerState } from '../audio/ChunkPlayer';
import { ApiError } from '../services/sonificationApi';
import {
  VINYL_BASE_PERIOD,
  VINYL_END_PERIOD,
  isVinylChunk,
  makeVinylChunkFetcher,
  progressOfPosition,
  syntheticPeriod,
  type VinylChunkMeta,
  type VinylConfig,
  type VinylStep,
  type VinylTravel,
} from '../services/vinylApi';
import { VINYL_CHUNKS, type LatLng } from '../utils/vinylGeometry';
import type { GridPoint } from '../types/zones';
import type { SonificationError, SonificationStatus } from './useSonification';
import { createPositionStore, type PositionStore } from './usePlaybackPosition';

/** Length of one side in seconds (10 grooves of 30 s). */
export const VINYL_SIDE_SECONDS = VINYL_CHUNKS * 30;

function chunkOf(position: number | null): number {
  return Math.min(VINYL_CHUNKS - 1, Math.floor(progressOfPosition(position) * VINYL_CHUNKS + 1e-9));
}

/** Seconds into the side for a player position (for usePlaybackPosition selectors). */
export function elapsedOf(position: number | null): number {
  return progressOfPosition(position) * VINYL_SIDE_SECONDS;
}

export interface UseVinylSonificationOptions {
  /** dataset_id of every enabled track, in track-list order */
  datasetIds: string[];
  center: LatLng;
  /** Month the record plays, "YYYY-MM" */
  timePeriod: string;
  /** What the needle travels through (default 'space') */
  travel?: VinylTravel;
  /** Travel 'both': how far the date moves per groove (default 'year') */
  step?: VinylStep;
  /** Music style id */
  genre?: string;
  /** Last month the enabled tracks have: where travel 'both' stops */
  rangeEnd?: string;
  /** Test seam: builds the ChunkFetcher (default: the vinyl API adapter) */
  makeFetcher?: (getConfig: () => VinylConfig) => ChunkFetcher;
}

/**
 * Plays the vinyl record through its own ChunkPlayer (zone mode keeps its own).
 *
 * Grooves are mapped onto synthetic periods (see services/vinylApi.ts) so the
 * player's 30 s chaining, prefetch and abort logic is reused as is.
 * Changing the centre, the month, the travel mode, the step or the style lifts
 * the needle back to the rim.
 */
export function useVinylSonification({
  datasetIds,
  center,
  timePeriod,
  travel = 'space',
  step = 'year',
  genre,
  rangeEnd,
  makeFetcher = makeVinylChunkFetcher,
}: UseVinylSonificationOptions) {
  const playerRef = useRef<ChunkPlayer | null>(null);
  const configRef = useRef<VinylConfig>({ center, timePeriod, travel, step, genre, rangeEnd });
  const [playerState, setPlayerState] = useState<PlayerState>('idle');
  // Position (synthetic fractional year) in an external store: ~10 updates/s
  // must not re-render App. Only the groove number is React state.
  const [positionStore] = useState<PositionStore>(() => createPositionStore(null));
  const [chunkIndex, setChunkIndex] = useState(0);
  const [error, setError] = useState<SonificationError | null>(null);
  const [hasEnded, setHasEnded] = useState(false);
  const [current, setCurrent] = useState<VinylChunkMeta | null>(null);
  /** Grooves heard so far for this centre and month, by index */
  const [history, setHistory] = useState<Record<number, VinylChunkMeta>>({});

  // Live progress for the animation loop, without a React render per frame
  const live = useRef({ position: null as number | null, stamp: 0, playing: false });

  useEffect(() => {
    const player = new ChunkPlayer({ fetchChunk: makeFetcher(() => configRef.current) });
    player.onProgress = ({ position: p }) => {
      live.current.position = p;
      live.current.stamp = performance.now();
      positionStore.set(p);
      setChunkIndex(chunkOf(p));
    };
    player.onStateChange = (s) => {
      live.current.playing = s === 'playing';
      live.current.stamp = performance.now();
      setPlayerState(s);
    };
    player.onChunk = (r) => {
      setError(null);
      if (!isVinylChunk(r)) return;
      setCurrent(r.vinyl);
      setHistory((h) => ({ ...h, [r.vinyl.chunkIndex]: r.vinyl }));
    };
    player.onError = (err) => {
      setError({
        kind: err instanceof ApiError ? err.kind : 'unknown',
        detail: err instanceof ApiError ? err.detail : err.message,
      });
    };
    player.onComplete = () => {
      setHasEnded(true);
      live.current.playing = false;
      live.current.position = null;
      positionStore.set(null);
      setChunkIndex(0);
    };
    playerRef.current = player;
    return () => {
      player.dispose();
      playerRef.current = null;
    };
    // The fetcher factory is a test seam, fixed for the hook's lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ChunkPlayer needs at least one point; a new centre is a new array
  const points = useMemo<GridPoint[]>(
    () => [{ lat: center.lat, lng: center.lng, x: 0, y: 0 }],
    [center.lat, center.lng]
  );
  const datasetKey = datasetIds.join(',');

  useEffect(() => {
    playerRef.current?.setParams({
      zoneId: 'vinyl',
      zoneName: null,
      points,
      datasetIds,
      endPeriod: VINYL_END_PERIOD,
    });
    // datasetKey stands for datasetIds
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, datasetKey]);

  // The latest settings for requests made from now on (the end of the data can
  // change with the tracks without restarting the record)
  configRef.current = { center, timePeriod, travel, step, genre, rangeEnd };

  // New centre, month, travel mode, step or style: back to the rim (aborts any
  // request for the old record). The step only matters when the date moves.
  const firstConfig = useRef(true);
  const stepKey = travel === 'both' ? step : '';
  useEffect(() => {
    if (firstConfig.current) {
      firstConfig.current = false;
      return;
    }
    setHistory({});
    setCurrent(null);
    setHasEnded(false);
    const player = playerRef.current;
    if (player && player.getPosition() !== null) player.seek(VINYL_BASE_PERIOD);
  }, [center.lat, center.lng, timePeriod, travel, stepKey, genre]);

  const canPlay = datasetIds.length > 0;

  const play = useCallback(async () => {
    setError(null);
    if (hasEnded) {
      setHasEnded(false);
      setHistory({});
    }
    await playerRef.current?.play(VINYL_BASE_PERIOD);
  }, [hasEnded]);

  const pause = useCallback(() => playerRef.current?.pause(), []);

  const stop = useCallback(() => {
    setHasEnded(false);
    positionStore.set(null);
    setChunkIndex(0);
    live.current.position = null;
    playerRef.current?.stop();
  }, [positionStore]);

  const seekToChunk = useCallback((k: number) => {
    const target = Math.max(0, Math.min(VINYL_CHUNKS - 1, Math.round(k)));
    setError(null);
    setHasEnded(false);
    playerRef.current?.seek(syntheticPeriod(target));
  }, []);

  const setVolume = useCallback((v: number) => playerRef.current?.setVolume(v), []);

  const nextGroove = useCallback(() => seekToChunk(chunkIndex + 1), [seekToChunk, chunkIndex]);
  const prevGroove = useCallback(() => {
    // Like a CD player: back to the start of this groove first, unless just started
    const intoGroove = progressOfPosition(positionStore.get()) * VINYL_CHUNKS - chunkIndex;
    seekToChunk(intoGroove > 0.1 ? chunkIndex : chunkIndex - 1);
  }, [seekToChunk, chunkIndex, positionStore]);

  /** Progress (0..1) now, extrapolated between the player's 100 ms ticks. */
  const getLiveProgress = useCallback(() => {
    const { position: p, stamp, playing } = live.current;
    const base = progressOfPosition(p);
    if (!playing || p === null) return base;
    const k = Math.min(VINYL_CHUNKS - 1, Math.floor(base * VINYL_CHUNKS + 1e-9));
    const extra = (performance.now() - stamp) / 1000 / VINYL_SIDE_SECONDS;
    return Math.min((k + 1) / VINYL_CHUNKS, base + Math.min(extra, 0.5 / VINYL_SIDE_SECONDS));
  }, []);

  const status: SonificationStatus = playerState === 'paused' ? 'idle' : playerState;

  return {
    status,
    isPlaying: playerState === 'playing' || playerState === 'loading',
    error,
    hasEnded,
    canPlay,
    /** Groove under the needle (0-based); changes once per groove */
    chunkIndex,
    /** Fine position (synthetic year): subscribe with usePlaybackPosition, see elapsedOf */
    positionStore,
    /** Meta of the audible groove (null before the first one plays) */
    current,
    history,
    /** Values of every enabled track for the audible groove */
    chunkValues: current?.values ?? {},
    getLiveProgress,
    play,
    pause,
    retry: play,
    stop,
    seekToChunk,
    nextGroove,
    prevGroove,
    setVolume,
  };
}

export default useVinylSonification;
