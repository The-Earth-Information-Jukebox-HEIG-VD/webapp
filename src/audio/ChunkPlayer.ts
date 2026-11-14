import {
  fetchZoneData,
  monthsBetween,
  addMonths,
  periodToYear,
  yearToPeriod,
  base64ToArrayBuffer,
  isAbortError,
  ApiError,
  type ZoneDataRequest,
  type ZoneDataResponse,
} from '../services/sonificationApi';
import type { GridPoint } from '../types/zones';

/**
 * ChunkPlayer - plays the backend's 30 s audio chunks back to back.
 *
 * Owns all playback state outside React (so re-renders never affect audio
 * timing); React subscribes through the `on*` callbacks.
 *
 * - Chunks are decoded from the embedded base64 `audio_data`.
 * - Chunk N+1 is scheduled at `chunkStart + months * 3 s` (not at the end of the
 *   buffer): the MP3 carries a ~1.7 s reverb tail beyond the music, which is
 *   left to overlap the start of the next chunk. The response has no duration:
 *   one bar = one month = 3 s (FRONTEND_API.md), so the length comes from
 *   `time_period` -> `next_time_period`.
 * - The next chunk is prefetched once the current one is 20% played, using the
 *   backend's `next_time_period` (null = end of the data).
 * - Seeking or changing zone/tracks aborts in-flight requests and starts over.
 * - Pause suspends the AudioContext, so the scheduled chain stays in sync.
 */

export type PlayerState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export interface PlayerParams {
  zoneId: string | null;
  zoneName: string | null;
  points: GridPoint[];
  /** dataset_id of every enabled track */
  datasetIds: string[];
  /** Latest last_time_period ("YYYY-MM") of the enabled tracks: where the final chunk ends */
  endPeriod: string | null;
}

export interface ProgressInfo {
  /** Current date as a fractional year */
  position: number;
}

export type ChunkFetcher = (req: ZoneDataRequest, signal: AbortSignal) => Promise<ZoneDataResponse>;

export interface ChunkPlayerOptions {
  fetchChunk?: ChunkFetcher;
  /** Interval of the progress/prefetch clock in ms (default 100) */
  tickMs?: number;
}

interface ScheduledChunk {
  response: ZoneDataResponse;
  source: AudioBufferSourceNode;
  startTime: number;
  duration: number;
  startPos: number;
  endPos: number;
}

const FIRST_CHUNK_DELAY_S = 0.05;
const MIN_LEAD_S = 0.02;
const PREFETCH_AT = 0.2;
const PREFETCH_MAX_RETRIES = 3;
const PREFETCH_RETRY_BASE_MS = 1000;
const REQUEST_TIMEOUT_MS = 30000;
const VOLUME_SMOOTHING_S = 0.015;
/** One bar of music is one month of data and lasts 3 s (30 s = 10 months), see FRONTEND_API.md */
export const SECONDS_PER_MONTH = 3;
/** Reverb tail the MP3 carries beyond its musical length */
const REVERB_TAIL_S = 1.7;

export class ChunkPlayer {
  onProgress?: (info: ProgressInfo) => void;
  onStateChange?: (state: PlayerState) => void;
  onChunk?: (response: ZoneDataResponse) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;

  private readonly fetchChunk: ChunkFetcher;
  private readonly tickMs: number;

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private volume = 0.5;

  private state: PlayerState = 'idle';
  private params: PlayerParams | null = null;
  /** Current date (fractional year); null = nothing played yet */
  private position: number | null = null;

  private chunks: ScheduledChunk[] = [];
  private controller: AbortController | null = null;
  private generation = 0;
  private fetching = false;
  /** Period to request after the last scheduled chunk; undefined = not known yet, null = end of data */
  private nextPeriod: string | null | undefined = undefined;
  private timer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  /** Chunk whose values were last reported through onChunk (reported when audible) */
  private announced: ScheduledChunk | null = null;
  /** A prefetch that kept failing: surfaced only when the audio runs out */
  private pendingError: Error | null = null;
  private disposed = false;

  constructor(options: ChunkPlayerOptions = {}) {
    this.fetchChunk = options.fetchChunk ?? fetchZoneData;
    this.tickMs = options.tickMs ?? 100;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  getState(): PlayerState {
    return this.state;
  }

  getPosition(): number | null {
    return this.position;
  }

  /**
   * Update zone/tracks. If audio is playing or loading, restarts from the
   * current position; if paused, discards the queued audio (Play starts afresh).
   */
  setParams(params: PlayerParams): void {
    const previous = this.params;
    this.params = params;
    if (!previous || !paramsChanged(previous, params)) return;

    if (this.state === 'playing' || this.state === 'loading') {
      this.start(this.currentPeriod());
    } else if (this.state === 'paused') {
      this.teardown();
      this.setState('idle');
    }
  }

  /**
   * Start or resume playback. Must be called from a user gesture the first time
   * (browser autoplay policy). `defaultPeriod` is used when there is no position yet.
   */
  async play(defaultPeriod: string): Promise<void> {
    if (this.disposed) return;
    const params = this.params;
    if (!params || params.datasetIds.length === 0 || params.points.length === 0) return;

    const ctx = this.ensureContext();

    if (this.state === 'paused' && this.chunks.length > 0) {
      this.setState('playing');
      this.startTimer();
      await ctx.resume();
      return;
    }
    if (this.state === 'playing' || this.state === 'loading') return;

    const period = this.position !== null ? this.currentPeriod() : defaultPeriod;
    this.start(period);
    await ctx.resume().catch(() => undefined);
  }

  pause(): void {
    if (this.state === 'loading' && this.chunks.length === 0) {
      // Nothing audible yet: cancel the request, keep the position
      this.teardown();
      this.setState('idle');
      return;
    }
    if (this.state !== 'playing' && this.state !== 'loading') return;
    this.stopTimer();
    this.setState('paused');
    void this.ctx?.suspend();
  }

  /** Stop and forget the position. */
  stop(): void {
    this.teardown();
    this.position = null;
    this.setState('idle');
  }

  /** Jump to a period ("YYYY-MM"). Restarts the audio if it is playing. */
  seek(period: string): void {
    const pos = periodToYear(period);
    if (Number.isNaN(pos)) return;
    this.position = pos;
    this.onProgress?.({ position: pos });

    if (this.state === 'playing' || this.state === 'loading') {
      this.start(period);
    } else {
      // paused / idle / error: drop queued audio, next Play starts here
      this.teardown();
      this.setState('idle');
    }
  }

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, VOLUME_SMOOTHING_S);
    }
  }

  /** Progress/prefetch clock; public so tests can drive it without timers. */
  tick(): void {
    const ctx = this.ctx;
    if (!ctx || this.chunks.length === 0) return;
    const now = ctx.currentTime;

    let current = this.chunks[0];
    for (const c of this.chunks) if (c.startTime <= now) current = c;

    if (now >= current.startTime && current !== this.announced) {
      this.announced = current;
      this.onChunk?.(current.response);
    }

    const elapsed = clamp((now - current.startTime) / current.duration, 0, 1);
    const position = current.startPos + elapsed * (current.endPos - current.startPos);
    if (position !== this.position) {
      this.position = position;
      this.onProgress?.({ position });
    }

    const isLast = current === this.chunks[this.chunks.length - 1];
    if (!isLast) return;

    if (elapsed >= 1 && this.pendingError) {
      this.fail(this.pendingError);
      return;
    }

    if (
      typeof this.nextPeriod === 'string' &&
      !this.fetching &&
      !this.retryTimer &&
      !this.pendingError &&
      elapsed >= PREFETCH_AT
    ) {
      const next = this.nextPeriod;
      this.nextPeriod = undefined;
      void this.loadChunk(next, this.generation, false, 0);
    }

    // Current chunk's music is over and the next one is not here yet
    if (elapsed >= 1 && this.nextPeriod !== null && this.state === 'playing') {
      this.setState('loading');
    }
  }

  dispose(): void {
    this.disposed = true;
    this.teardown();
    this.onProgress = this.onStateChange = this.onChunk = this.onError = this.onComplete = undefined;
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    void ctx?.close().catch(() => undefined);
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) throw new Error('Web Audio API is not supported');
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  private currentPeriod(): string {
    return yearToPeriod(this.position ?? 0);
  }

  private setState(state: PlayerState): void {
    if (this.state === state) return;
    this.state = state;
    this.onStateChange?.(state);
  }

  /** Discard everything and request the chunk starting at `period`. */
  private start(period: string): void {
    this.teardown();
    this.controller = new AbortController();
    this.position = periodToYear(period);
    this.setState('loading');
    this.startTimer();
    void this.loadChunk(period, this.generation, true, 0);
  }

  private async loadChunk(period: string, gen: number, isFirst: boolean, attempt: number): Promise<void> {
    const ctx = this.ctx;
    const controller = this.controller;
    const params = this.params;
    if (!ctx || !controller || !params) return;
    this.fetching = true;
    const request = withTimeout(controller.signal, REQUEST_TIMEOUT_MS);

    try {
      const fetched = await this.fetchChunk(buildRequest(params, period), request.signal);
      if (!fetched.audio_data) throw new ApiError(200, 'Empty audio', 'unknown');
      const buffer = await ctx.decodeAudioData(base64ToArrayBuffer(fetched.audio_data));
      if (gen !== this.generation) return;
      // The base64 is no longer needed once decoded
      this.schedule({ ...fetched, audio_data: '' }, buffer);
    } catch (err) {
      if (gen !== this.generation) return;
      if (isAbortError(err) && !request.timedOut()) return;
      const error = request.timedOut()
        ? new ApiError(0, 'Request timed out', 'backendUnavailable')
        : err instanceof Error
          ? err
          : new Error(String(err));
      if (isFirst) {
        this.fail(error);
        return;
      }
      // Prefetch: the current chunk is still playing, so retry quietly with backoff
      if (attempt < PREFETCH_MAX_RETRIES) {
        this.fetching = false;
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          if (gen === this.generation) void this.loadChunk(period, gen, false, attempt + 1);
        }, PREFETCH_RETRY_BASE_MS * 2 ** attempt);
        return;
      }
      this.pendingError = error;
      if (this.chunks.length === 0) this.fail(error);
    } finally {
      request.cancel();
      if (gen === this.generation && !this.retryTimer) this.fetching = false;
    }
  }

  private schedule(response: ZoneDataResponse, buffer: AudioBuffer): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    const timing = computeChunkTiming(response, buffer.duration, this.params?.endPeriod ?? null);
    const duration = timing.duration;
    const last = this.chunks[this.chunks.length - 1];
    const startTime = last
      ? Math.max(last.startTime + last.duration, ctx.currentTime + MIN_LEAD_S)
      : ctx.currentTime + FIRST_CHUNK_DELAY_S;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(master);
    source.start(startTime);

    const parsedStart = periodToYear(response.time_period ?? '');
    const startPos = Number.isNaN(parsedStart) ? (this.position ?? 0) : parsedStart;
    const chunk: ScheduledChunk = {
      response,
      source,
      startTime,
      duration,
      startPos,
      endPos: timing.endMonths === null ? startPos : startPos + timing.endMonths / 12,
    };

    source.onended = () => this.handleEnded(chunk);
    this.chunks.push(chunk);
    this.nextPeriod = response.next_time_period;

    if (this.chunks.length === 1) {
      this.position = chunk.startPos;
      this.onProgress?.({ position: chunk.startPos });
    }
    if (this.state === 'loading') this.setState('playing');
  }

  private handleEnded(chunk: ScheduledChunk): void {
    chunk.source.onended = null;
    chunk.source.disconnect();
    this.chunks = this.chunks.filter((c) => c !== chunk);
    if (this.chunks.length === 0 && this.pendingError) {
      this.fail(this.pendingError);
    } else if (this.chunks.length === 0 && this.nextPeriod === null && !this.fetching) {
      const end = chunk.endPos;
      this.teardown();
      this.position = null;
      this.onProgress?.({ position: end });
      this.setState('idle');
      this.onComplete?.();
    } else if (this.chunks.length === 0 && this.nextPeriod !== null && this.state === 'playing') {
      this.setState('loading'); // starved: waiting for the next chunk
    }
  }

  private fail(error: Error): void {
    this.teardown();
    this.setState('error');
    this.onError?.(error);
  }

  private startTimer(): void {
    this.stopTimer();
    this.timer = setInterval(() => this.tick(), this.tickMs);
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Abort requests, stop scheduled audio and the clock. Keeps the position. */
  private teardown(): void {
    this.generation++;
    this.controller?.abort();
    this.controller = null;
    this.fetching = false;
    this.nextPeriod = undefined;
    this.announced = null;
    this.pendingError = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.stopTimer();
    for (const c of this.chunks) {
      c.source.onended = null;
      try {
        c.source.stop();
      } catch {
        /* already stopped */
      }
      c.source.disconnect();
    }
    this.chunks = [];
    // A paused context stays suspended after a restart otherwise
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }
}

function buildRequest(params: PlayerParams, period: string): ZoneDataRequest {
  return {
    zone_id: params.zoneId,
    zone_name: params.zoneName,
    dataset_ids: params.datasetIds,
    points: params.points,
    time_period: period,
    aggregation: 'mean',
  };
}

/**
 * Length and extent of a chunk. The response carries no duration, so it is
 * derived from the months it covers (3 s each):
 * - with `next_time_period`: months from `time_period` to it;
 * - last chunk (next is null): months from `time_period` to the month after the
 *   enabled tracks' last data.
 * Never longer than the decoded audio: if the computed length does not fit,
 * fall back to the buffer minus its reverb tail.
 *
 * @returns `duration` in seconds and `endMonths`, the months covered (null if unknown)
 */
export function computeChunkTiming(
  response: ZoneDataResponse,
  bufferDuration: number,
  endPeriod: string | null
): { duration: number; endMonths: number | null } {
  const target = response.next_time_period ?? (endPeriod ? addMonths(endPeriod, 1) : null);
  const months = target ? monthsBetween(response.time_period, target) : NaN;
  const valid = Number.isFinite(months) && months > 0;
  const computed = valid ? months * SECONDS_PER_MONTH : NaN;
  const fallback = Math.max(1, bufferDuration - REVERB_TAIL_S);
  const duration = Number.isFinite(computed) && computed < bufferDuration ? computed : fallback;
  return { duration, endMonths: valid ? months : null };
}

interface TimedRequest {
  signal: AbortSignal;
  timedOut: () => boolean;
  cancel: () => void;
}

/** The controller's signal combined with a timeout (AbortSignal.any when available). */
function withTimeout(parent: AbortSignal, ms: number): TimedRequest {
  try {
    if (typeof AbortSignal.any === 'function' && typeof AbortSignal.timeout === 'function') {
      const timeout = AbortSignal.timeout(ms);
      return {
        signal: AbortSignal.any([parent, timeout]),
        timedOut: () => timeout.aborted && !parent.aborted,
        cancel: () => undefined,
      };
    }
  } catch {
    /* fall through to the manual timer */
  }
  const local = new AbortController();
  let expired = false;
  const onAbort = () => local.abort();
  if (parent.aborted) local.abort();
  else parent.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => {
    expired = true;
    local.abort();
  }, ms);
  return {
    signal: local.signal,
    timedOut: () => expired,
    cancel: () => {
      clearTimeout(timer);
      parent.removeEventListener('abort', onAbort);
    },
  };
}

function paramsChanged(a: PlayerParams, b: PlayerParams): boolean {
  return (
    a.zoneId !== b.zoneId ||
    a.points !== b.points ||
    a.datasetIds.length !== b.datasetIds.length ||
    a.datasetIds.some((id, i) => id !== b.datasetIds[i])
  );
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export default ChunkPlayer;
