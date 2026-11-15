import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChunkPlayer, computeChunkTiming, monthsElapsed, type PlayerParams } from './ChunkPlayer';
import { MockAudioContext } from '../test/setup';
import type { ZoneDataRequest, ZoneDataResponse } from '../services/sonificationApi';

const params: PlayerParams = {
  zoneId: 'europe',
  zoneName: 'Europe',
  points: [{ lat: 48, lng: 2, x: 1, y: 1 }],
  datasetIds: ['temperature'],
  endPeriod: '1951-02',
};

function chunk(period: string, next: string | null): ZoneDataResponse {
  return {
    zone_id: 'europe', dataset_ids: ['temperature'],
    time_period: period, next_time_period: next,
    audio_data: 'AAAA', values: { temperature: 1.2 }, point_count: 1,
  };
}

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

beforeEach(() => {
  MockAudioContext.sources.length = 0;
});

describe('ChunkPlayer', () => {
  it('chains chunks via next_time_period, schedules at duration_s and completes on null', async () => {
    const requests: ZoneDataRequest[] = [];
    const fetchChunk = vi.fn(async (req: ZoneDataRequest) => {
      requests.push(req);
      return req.time_period === '1950-01' ? chunk('1950-01', '1950-11') : chunk('1950-11', null);
    });
    const player = new ChunkPlayer({ fetchChunk });
    const onComplete = vi.fn();
    player.onComplete = onComplete;
    player.setParams(params);

    await player.play('1950-01');
    await flush();
    expect(requests[0].time_period).toBe('1950-01');
    expect(requests[0].dataset_ids).toEqual(['temperature']);
    expect(requests[0].aggregation).toBe('mean');
    expect(MockAudioContext.sources).toHaveLength(1);
    expect(player.getState()).toBe('playing');

    // Before 20%: no prefetch
    player.tick();
    expect(fetchChunk).toHaveBeenCalledTimes(1);

    // Move the clock past 50% of the chunk
    const ctx = (player as unknown as { ctx: { currentTime: number } }).ctx;
    ctx.currentTime = 0.05 + 16;
    player.tick();
    await flush();
    expect(requests[1].time_period).toBe('1950-11');
    expect(MockAudioContext.sources).toHaveLength(2);
    // Second chunk starts exactly duration_s after the first (reverb tail overlaps)
    expect(MockAudioContext.sources[1].startedAt).toBeCloseTo(0.05 + 30, 5);

    // Last chunk ends and nextPeriod was null: done
    MockAudioContext.sources[0].onended?.();
    MockAudioContext.sources[1].onended?.();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(player.getState()).toBe('idle');
    player.dispose();
  });

  it('aborts the request in flight on seek', async () => {
    const signals: AbortSignal[] = [];
    const fetchChunk = vi.fn((_req: ZoneDataRequest, signal: AbortSignal) => {
      signals.push(signal);
      return new Promise<ZoneDataResponse>(() => {});
    });
    const player = new ChunkPlayer({ fetchChunk });
    player.setParams(params);
    await player.play('1880-01');
    expect(player.getState()).toBe('loading');

    player.seek('1950-01');
    expect(signals[0].aborted).toBe(true);
    expect(signals).toHaveLength(2);
    expect(fetchChunk.mock.calls[1][0].time_period).toBe('1950-01');
    player.dispose();
  });

  it('reports an error and keeps the position for a retry', async () => {
    const fetchChunk = vi.fn().mockRejectedValue(new Error('boom'));
    const player = new ChunkPlayer({ fetchChunk });
    const onError = vi.fn();
    player.onError = onError;
    player.setParams(params);
    await player.play('1950-01');
    await flush();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(player.getState()).toBe('error');
    expect(player.getPosition()).toBeCloseTo(1950, 5);
    player.dispose();
  });

  it('restarts from the current position when the tracks change while playing', async () => {
    const fetchChunk = vi.fn(async (req: ZoneDataRequest) => chunk(req.time_period ?? '', '1950-11'));
    const player = new ChunkPlayer({ fetchChunk });
    player.setParams(params);
    await player.play('1950-01');
    await flush();
    player.setParams({ ...params, datasetIds: ['temperature', 'precipitation'] });
    await flush();
    expect(fetchChunk.mock.calls.at(-1)?.[0].dataset_ids).toEqual(['temperature', 'precipitation']);
    expect(fetchChunk.mock.calls.at(-1)?.[0].time_period).toBe('1950-01');
    player.dispose();
  });

  it('reports a chunk through onChunk only when it becomes audible', async () => {
    const fetchChunk = vi.fn(async (req: ZoneDataRequest) =>
      req.time_period === '1950-01' ? chunk('1950-01', '1950-11') : chunk('1950-11', null)
    );
    const player = new ChunkPlayer({ fetchChunk });
    const seen: string[] = [];
    player.onChunk = (r) => seen.push(r.time_period ?? '');
    player.setParams(params);
    await player.play('1950-01');
    await flush();
    const ctx = (player as unknown as { ctx: { currentTime: number } }).ctx;

    ctx.currentTime = 0; // first chunk scheduled at 0.05 s: not audible yet
    player.tick();
    expect(seen).toEqual([]);
    ctx.currentTime = 0.06;
    player.tick();
    expect(seen).toEqual(['1950-01']);

    // Prefetch the second chunk: it is scheduled but must not be reported yet
    ctx.currentTime = 10;
    player.tick();
    await flush();
    player.tick();
    expect(seen).toEqual(['1950-01']);
    ctx.currentTime = 0.05 + 30.1;
    player.tick();
    expect(seen).toEqual(['1950-01', '1950-11']);
    player.dispose();
  });

  it('keeps playing when a prefetch keeps failing and errors only when the audio runs out', async () => {
    vi.useFakeTimers();
    try {
      const fetchChunk = vi.fn(async (req: ZoneDataRequest) => {
        if (req.time_period === '1950-01') return chunk('1950-01', '1950-11');
        throw new Error('network down');
      });
      const player = new ChunkPlayer({ fetchChunk });
      const onError = vi.fn();
      player.onError = onError;
      player.setParams(params);
      await player.play('1950-01');
      await vi.advanceTimersByTimeAsync(0);
      const ctx = (player as unknown as { ctx: { currentTime: number } }).ctx;
      ctx.currentTime = 10;
      player.tick();
      // 1 s, 2 s, 4 s backoff
      for (const wait of [0, 1000, 2000, 4000]) await vi.advanceTimersByTimeAsync(wait);
      expect(fetchChunk).toHaveBeenCalledTimes(5); // first chunk + prefetch + 3 retries
      expect(onError).not.toHaveBeenCalled();
      expect(player.getState()).toBe('playing');

      ctx.currentTime = 0.05 + 30.1;
      player.tick();
      expect(onError).toHaveBeenCalledTimes(1);
      expect(player.getState()).toBe('error');
      player.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('computeChunkTiming', () => {
  it('is 3 s per month up to next_time_period', () => {
    const t = computeChunkTiming(chunk('2015-01', '2015-11'), 31.7, null);
    expect(t.duration).toBe(30);
    expect(t.endMonths).toBe(10);
  });

  it('on the last chunk runs to the month after the last data', () => {
    const t = computeChunkTiming(chunk('2025-06', null), 31.7, '2025-12');
    expect(t.endMonths).toBe(7); // 2025-06 .. 2025-12 inclusive
    expect(t.duration).toBe(21);
  });

  it('never exceeds the decoded audio: falls back to buffer minus the reverb tail', () => {
    const t = computeChunkTiming(chunk('2015-01', '2016-01'), 31.7, null); // 12 months = 36 s
    expect(t.duration).toBeCloseTo(30, 5);
    expect(computeChunkTiming(chunk('2025-06', null), 20, null).duration).toBeCloseTo(18.3, 5);
  });
});

/** A 30 s chunk of `months` months (v2.9+: the temperature sets the tempo). */
function timedChunk(period: string, next: string | null, months: number): ZoneDataResponse {
  const bar = 30 / months;
  return {
    ...chunk(period, next),
    duration_s: 30,
    bar_starts_s: Array.from({ length: months }, (_, i) => i * bar),
  };
}

describe('chunk timing from duration_s and bar_starts_s', () => {
  it('uses duration_s, not months x 3 s', () => {
    expect(computeChunkTiming(timedChunk('2015-01', '2015-09', 8), 31.7, null)).toMatchObject({
      duration: 30,
      endMonths: 8,
    });
    expect(computeChunkTiming(timedChunk('2015-01', '2016-02', 13), 31.7, null)).toMatchObject({
      duration: 30,
      endMonths: 13,
    });
  });

  it('caps duration_s by the decoded audio', () => {
    const r = { ...timedChunk('2015-01', '2015-09', 8), duration_s: 40 };
    expect(computeChunkTiming(r, 31.7, null).duration).toBeCloseTo(30, 5);
  });

  it('maps seconds to months piecewise over bar_starts_s', () => {
    const starts = [0, 2, 6, 10]; // uneven bars, 12 s chunk
    expect(monthsElapsed(starts, 12, 0)).toBe(0);
    expect(monthsElapsed(starts, 12, 1)).toBeCloseTo(0.5, 5);
    expect(monthsElapsed(starts, 12, 4)).toBeCloseTo(1.5, 5);
    expect(monthsElapsed(starts, 12, 11)).toBeCloseTo(3.5, 5);
    expect(monthsElapsed(starts, 12, 12)).toBeCloseTo(4, 5);
    expect(monthsElapsed(starts, 12, 99)).toBeCloseTo(4, 5);
  });

  it('schedules 8-month and 13-month chunks back to back at 30 s and tracks the position', async () => {
    const fetchChunk = vi.fn(async (req: ZoneDataRequest) => {
      if (req.time_period === '1950-01') return timedChunk('1950-01', '1950-09', 8);
      if (req.time_period === '1950-09') return timedChunk('1950-09', '1951-10', 13);
      return timedChunk('1951-10', null, 10);
    });
    const player = new ChunkPlayer({ fetchChunk });
    player.setParams(params);
    await player.play('1950-01');
    await flush();
    const ctx = (player as unknown as { ctx: { currentTime: number } }).ctx;

    ctx.currentTime = 0.05 + 7.5; // 2 of 8 bars (3.75 s each)
    player.tick();
    await flush();
    expect(player.getPosition()).toBeCloseTo(1950 + 2 / 12, 5);
    expect(MockAudioContext.sources).toHaveLength(2);
    expect(MockAudioContext.sources[1].startedAt).toBeCloseTo(0.05 + 30, 5);

    ctx.currentTime = 0.05 + 30 + (3 * 30) / 13; // three bars (past 20%) into the 13-month chunk
    player.tick();
    await flush();
    expect(MockAudioContext.sources[2].startedAt).toBeCloseTo(0.05 + 60, 5);
    expect(player.getPosition()).toBeCloseTo(1950 + 8 / 12 + 3 / 12, 5);
    player.dispose();
  });

  it('restarts from the current position when the style changes, and sends the genre', async () => {
    const fetchChunk = vi.fn(async (req: ZoneDataRequest) => chunk(req.time_period ?? '', '1950-11'));
    const player = new ChunkPlayer({ fetchChunk });
    player.setParams({ ...params, genre: 'orchestra' });
    await player.play('1950-01');
    await flush();
    expect(fetchChunk.mock.calls[0][0].genre).toBe('orchestra');
    player.setParams({ ...params, genre: 'funk' });
    await flush();
    expect(fetchChunk).toHaveBeenCalledTimes(2);
    expect(fetchChunk.mock.calls[1][0]).toMatchObject({ genre: 'funk', time_period: '1950-01' });
    player.dispose();
  });
});

describe('ChunkPlayer on iOS', () => {
  type Ctx = { state: string; onstatechange: null | (() => void) };
  const ctxOf = (p: ChunkPlayer) => (p as unknown as { ctx: Ctx }).ctx;
  const okFetch = () => vi.fn(async (req: ZoneDataRequest) => chunk(req.time_period ?? '', '1950-11'));

  it('asks for the "playback" audio session so the silent switch does not mute it', async () => {
    const session = { type: 'auto' };
    Object.defineProperty(navigator, 'audioSession', { value: session, configurable: true });
    try {
      const player = new ChunkPlayer({ fetchChunk: okFetch() });
      player.setParams(params);
      await player.play('1950-01');
      expect(session.type).toBe('playback');
      player.dispose();
    } finally {
      delete (navigator as unknown as { audioSession?: unknown }).audioSession;
    }
  });

  it('pauses when iOS interrupts the context, and resumes on the next play', async () => {
    const player = new ChunkPlayer({ fetchChunk: okFetch() });
    player.setParams(params);
    await player.play('1950-01');
    await flush();
    expect(player.getState()).toBe('playing');

    const ctx = ctxOf(player);
    const onInterrupted = vi.fn();
    player.onInterrupted = onInterrupted;
    // Well after our own resume() (its statechange events are ignored)
    (player as unknown as { lastOwnStateCall: number }).lastOwnStateCall = -Infinity;
    ctx.state = 'interrupted';
    ctx.onstatechange?.();
    expect(player.getState()).toBe('paused');
    expect(onInterrupted).toHaveBeenCalledTimes(1);

    await player.play('1950-01');
    expect(ctx.state).toBe('running');
    expect(player.getState()).toBe('playing');
    player.dispose();
  });

  it('stops the silent keep-alive when playback stops', async () => {
    const player = new ChunkPlayer({ fetchChunk: okFetch() });
    const keepAlive = (player as unknown as { keepAlive: { pause: () => void } }).keepAlive;
    const spy = vi.spyOn(keepAlive, 'pause');
    player.setParams(params);
    await player.play('1950-01');
    await flush();
    player.stop();
    expect(spy).toHaveBeenCalled();
    player.dispose();
  });

  it('ignores the suspend it caused itself on pause', async () => {
    const player = new ChunkPlayer({ fetchChunk: okFetch() });
    player.setParams(params);
    await player.play('1950-01');
    await flush();
    const onInterrupted = vi.fn();
    player.onInterrupted = onInterrupted;
    player.pause();
    const ctx = ctxOf(player);
    ctx.onstatechange?.();
    expect(player.getState()).toBe('paused');
    expect(onInterrupted).not.toHaveBeenCalled();
    player.dispose();
  });
});
