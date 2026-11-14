import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChunkPlayer, computeChunkTiming, type PlayerParams } from './ChunkPlayer';
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
