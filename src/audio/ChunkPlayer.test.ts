import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChunkPlayer, computeEndPos, type PlayerParams } from './ChunkPlayer';
import { MockAudioContext } from '../test/setup';
import type { SonifyRequest, SonifyResponse } from '../services/sonificationApi';

const params: PlayerParams = {
  zoneId: 'europe',
  zoneName: 'Europe',
  points: [{ lat: 48, lng: 2, x: 1, y: 1 }],
  datasetIds: ['temperature'],
};

function chunk(period: string, next: string | null): SonifyResponse {
  return {
    zone_id: 'europe', zone_name: 'Europe', dataset_id: ['temperature'],
    time_period: period, next_time_period: next,
    audio_data: 'AAAA', audio_format: 'mp3', audio_url: '',
    value: 1.2, units: 'degC', values: {}, point_count: 1, cell_count: 1,
    aggregation: 'mean', time_end: period, duration_s: 30, composition_id: 'x',
    cached: false, source_dataset: 'real', source_datasets: null, real_data: true, anomaly: true,
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
    const requests: SonifyRequest[] = [];
    const fetchChunk = vi.fn(async (req: SonifyRequest) => {
      requests.push(req);
      return req.time_period === '1950-01' ? chunk('1950-01', '1960-01') : chunk('1960-01', null);
    });
    const player = new ChunkPlayer({ fetchChunk });
    const onComplete = vi.fn();
    player.onComplete = onComplete;
    player.setParams(params);

    await player.play('1950-01');
    await flush();
    expect(requests[0].time_period).toBe('1950-01');
    expect(requests[0].dataset_id).toEqual(['temperature']);
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
    expect(requests[1].time_period).toBe('1960-01');
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
    const fetchChunk = vi.fn((_req: SonifyRequest, signal: AbortSignal) => {
      signals.push(signal);
      return new Promise<SonifyResponse>(() => {});
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
    const fetchChunk = vi.fn(async (req: SonifyRequest) => chunk(req.time_period ?? '', '1960-01'));
    const player = new ChunkPlayer({ fetchChunk });
    player.setParams(params);
    await player.play('1950-01');
    await flush();
    player.setParams({ ...params, datasetIds: ['temperature', 'precipitation'] });
    await flush();
    expect(fetchChunk.mock.calls.at(-1)?.[0].dataset_id).toEqual(['temperature', 'precipitation']);
    expect(fetchChunk.mock.calls.at(-1)?.[0].time_period).toBe('1950-01');
    player.dispose();
  });

  it('reports a chunk through onChunk only when it becomes audible', async () => {
    const fetchChunk = vi.fn(async (req: SonifyRequest) =>
      req.time_period === '1950-01' ? chunk('1950-01', '1960-01') : chunk('1960-01', null)
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
    expect(seen).toEqual(['1950-01', '1960-01']);
    player.dispose();
  });

  it('keeps playing when a prefetch keeps failing and errors only when the audio runs out', async () => {
    vi.useFakeTimers();
    try {
      const fetchChunk = vi.fn(async (req: SonifyRequest) => {
        if (req.time_period === '1950-01') return chunk('1950-01', '1960-01');
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

describe('computeEndPos', () => {
  it('uses next_time_period when there is one', () => {
    expect(computeEndPos(chunk('1950-01', '1960-01'), 1950, 30)).toBeCloseTo(1960, 5);
  });

  it('adds one bar after time_end on the last chunk (time_end is the START of the last bar)', () => {
    const last = { ...chunk('2020-01', null), time_end: '2025-12' };
    // 10 bars of 6 months... here 71 months / 9 gaps is the bar step
    const end = computeEndPos(last, 2020, 30);
    const lastBar = 2025 + 11 / 12;
    expect(end).toBeGreaterThan(lastBar);
    expect(end - lastBar).toBeCloseTo((lastBar - 2020) / 9, 5);
  });

  it('falls back to one month for a single bar', () => {
    const last = { ...chunk('2025-12', null), time_end: '2025-12' };
    expect(computeEndPos(last, 2025 + 11 / 12, 3)).toBeCloseTo(2025 + 11 / 12 + 1 / 12, 5);
  });
});
