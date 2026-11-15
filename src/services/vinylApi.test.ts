import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  VINYL_BASE_PERIOD,
  VINYL_END_PERIOD,
  bothDate,
  periodAt,
  dateSpan,
  buildGrooveRequest,
  chunkIndexOf,
  fetchVinylChunk,
  isVinylChunk,
  makeVinylChunkFetcher,
  meanValues,
  progressOfPosition,
  syntheticPeriod,
  type VinylDeps,
  type VinylRequest,
  type VinylResponse,
} from './vinylApi';
import {
  ApiError,
  type GrooveRequest,
  type GrooveResponse,
  type ZoneDataRequest,
  type ZoneDataResponse,
} from './sonificationApi';
import { ChunkPlayer, computeChunkTiming } from '../audio/ChunkPlayer';
import { MockAudioContext } from '../test/setup';
import { GROOVE_RADIUS_DEG, groovePath } from '../utils/vinylGeometry';

const center = { lat: 50, lng: 10 };

function grooveResponse(req: GrooveRequest): GrooveResponse {
  return {
    zone_id: req.zone_id,
    time_period: req.time_period,
    dataset_ids: req.dataset_ids,
    audio_data: 'AAAA',
    duration_s: 30,
    bar_seconds: 3,
    points_per_bar: req.points_per_bar,
    stop_seconds: 3 / req.points_per_bar,
    radius_deg: req.radius_deg,
    stops: req.path.map((p, i) => ({
      lat: p.lat,
      lng: p.lng,
      values: { temperature: i % 2 ? 1 : 3, lightning: i === 0 ? null : 0 },
    })),
  };
}

function deps(overrides: Partial<VinylDeps> = {}): VinylDeps {
  return {
    fetchGroove: vi.fn(async (req: GrooveRequest) => grooveResponse(req)),
    ...overrides,
  };
}

const req = (k: number): VinylRequest => ({
  dataset_ids: ['temperature', 'lightning'],
  time_period: '2018-07',
  center,
  chunk_index: k,
});

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

beforeEach(() => {
  MockAudioContext.sources.length = 0;
});

describe('synthetic periods', () => {
  it('encode one groove every 10 months', () => {
    expect(syntheticPeriod(0)).toBe(VINYL_BASE_PERIOD);
    expect(syntheticPeriod(3)).toBe('2002-07');
    expect(chunkIndexOf('2002-07')).toBe(3);
    expect(chunkIndexOf('2002-10')).toBe(3);
    expect(chunkIndexOf('1990-01')).toBe(0);
    expect(chunkIndexOf('2030-01')).toBe(9);
    expect(VINYL_END_PERIOD).toBe('2008-04');
  });

  it('map the player position to progress over the side', () => {
    expect(progressOfPosition(null)).toBe(0);
    expect(progressOfPosition(2000)).toBe(0);
    expect(progressOfPosition(2000 + 50 / 12)).toBeCloseTo(0.5);
    expect(progressOfPosition(2100)).toBe(1);
  });

  it('give every groove, including the last, 30 s', () => {
    const last = { time_period: syntheticPeriod(9), next_time_period: null } as ZoneDataResponse;
    expect(computeChunkTiming(last, 31.7, VINYL_END_PERIOD).duration).toBe(30);
  });
});

describe('buildGrooveRequest', () => {
  it('sends whole bars of the groove path at the chosen month', () => {
    const r = buildGrooveRequest(center, 0, '2018-07', ['temperature']);
    expect(r.time_period).toBe('2018-07');
    expect(r.dataset_ids).toEqual(['temperature']);
    expect(r.radius_deg).toBe(GROOVE_RADIUS_DEG);
    expect(r.points_per_bar).toBe(4);
    expect(r.path).toHaveLength(40);
    expect(r.path).toEqual(groovePath(center, 0).path);
    expect(r.zone_id).toBe('record-50.0_10.0');
    expect(r.path.length % r.points_per_bar).toBe(0);
  });
});

describe('fetchVinylChunk', () => {
  it('maps the groove answer: stops, their clock, null kept, means without null', async () => {
    const d = deps();
    const res = await fetchVinylChunk(req(4), undefined, d);
    const sent = (d.fetchGroove as ReturnType<typeof vi.fn>).mock.calls[0][0] as GrooveRequest;
    expect(sent.path).toEqual(groovePath(center, 4).path);
    expect(res.stops).toHaveLength(sent.path.length);
    expect(res.stop_seconds).toBe(3 / sent.points_per_bar);
    expect(res.stops[0].values.lightning).toBeNull();
    expect(res.values.temperature).toBeCloseTo(2);
    expect(res.values.lightning).toBe(0);
    expect(res.chunk_index).toBe(4);
    expect(res.next_chunk_index).toBe(5);
  });

  it('ends after the tenth groove', async () => {
    expect((await fetchVinylChunk(req(9), undefined, deps())).next_chunk_index).toBeNull();
  });

  it('passes backend errors through (e.g. no data at that date)', async () => {
    const err = new ApiError(400, 'No data at that date', 'noDataForPeriod');
    const d = deps({
      fetchGroove: vi.fn(async () => {
        throw err;
      }),
    });
    await expect(fetchVinylChunk(req(0), undefined, d)).rejects.toBe(err);
  });

  it('meanValues ignores null and missing values', () => {
    expect(
      meanValues([
        { lat: 0, lng: 0, values: { a: 1, b: null } },
        { lat: 0, lng: 1, values: { a: 3 } },
      ])
    ).toEqual({ a: 2 });
  });
});

describe('vinyl fetcher on the real ChunkPlayer', () => {
  function fakeVinyl(r: VinylRequest): VinylResponse {
    const k = r.chunk_index;
    return {
      dataset_ids: r.dataset_ids,
      time_period: r.time_period,
      center: r.center,
      chunk_index: k,
      next_chunk_index: k < 9 ? k + 1 : null,
      chunk_count: 10,
      stops: [{ lat: 0, lng: 0, values: { temperature: k } }],
      stop_seconds: 30,
      radius_deg: 2,
      audio_data: 'AAAA',
      values: { temperature: k },
    };
  }

  const params = {
    zoneId: 'vinyl',
    zoneName: null,
    points: [{ lat: 50, lng: 10, x: 0, y: 0 }],
    datasetIds: ['temperature'],
    endPeriod: VINYL_END_PERIOD,
  };

  it('chains 10 grooves of 30 s and completes', async () => {
    const requests: VinylRequest[] = [];
    const fetchVinyl = vi.fn(async (r: VinylRequest) => {
      requests.push(r);
      return fakeVinyl(r);
    });
    const player = new ChunkPlayer({
      fetchChunk: makeVinylChunkFetcher(() => ({ timePeriod: '2020-03', center }), fetchVinyl),
    });
    const chunks: ZoneDataResponse[] = [];
    player.onChunk = (r) => chunks.push(r);
    const onComplete = vi.fn();
    player.onComplete = onComplete;
    player.setParams(params);

    await player.play(VINYL_BASE_PERIOD);
    await flush();
    const ctx = (player as unknown as { ctx: { currentTime: number } }).ctx;
    for (let k = 1; k < 10; k++) {
      ctx.currentTime = 0.05 + 30 * (k - 1) + 10;
      player.tick();
      await flush();
      expect(MockAudioContext.sources[k].startedAt).toBeCloseTo(0.05 + 30 * k, 5);
    }
    expect(requests.map((r) => r.chunk_index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(requests.every((r) => r.time_period === '2020-03')).toBe(true);
    expect(isVinylChunk(chunks[0])).toBe(true);

    for (const s of MockAudioContext.sources) s.onended?.();
    expect(onComplete).toHaveBeenCalledTimes(1);
    player.dispose();
  });

  it('seeking to a groove requests that groove', async () => {
    const fetchVinyl = vi.fn(async (r: VinylRequest) => fakeVinyl(r));
    const player = new ChunkPlayer({
      fetchChunk: makeVinylChunkFetcher(() => ({ timePeriod: '2020-03', center }), fetchVinyl),
    });
    player.setParams(params);
    await player.play(VINYL_BASE_PERIOD);
    await flush();
    player.seek(syntheticPeriod(4));
    await flush();
    expect(fetchVinyl.mock.calls.at(-1)![0].chunk_index).toBe(4);
    player.dispose();
  });
});

describe('travel through space and time', () => {
  const run = (cfg: Parameters<typeof makeVinylChunkFetcher>[0], fetchVinyl: Parameters<typeof makeVinylChunkFetcher>[1], fetchZone?: Parameters<typeof makeVinylChunkFetcher>[2]) =>
    makeVinylChunkFetcher(cfg, fetchVinyl, fetchZone);
  const player = (k: number) => ({ time_period: syntheticPeriod(k), dataset_ids: ['temperature'] }) as ZoneDataRequest;
  const fakeGroove = async (r: VinylRequest): Promise<VinylResponse> => ({
    dataset_ids: r.dataset_ids,
    time_period: r.time_period,
    center: r.center,
    chunk_index: r.chunk_index,
    next_chunk_index: r.chunk_index < 9 ? r.chunk_index + 1 : null,
    chunk_count: 10,
    stops: [],
    stop_seconds: 3,
    radius_deg: 2,
    audio_data: 'AAAA',
    values: {},
  });

  it('space: sends the genre and keeps one date', async () => {
    const fetchVinyl = vi.fn(fakeGroove);
    const f = run(() => ({ timePeriod: '2020-03', center, genre: 'funk' }), fetchVinyl);
    const chunk = await f(player(2), new AbortController().signal);
    expect(fetchVinyl.mock.calls[0][0]).toMatchObject({ chunk_index: 2, time_period: '2020-03', genre: 'funk' });
    expect(isVinylChunk(chunk) && chunk.vinyl.periods).toEqual(['2020-03']);
    // Every groove claims 30 s of ten 3 s bars
    expect(chunk.duration_s).toBe(30);
    expect(chunk.bar_starts_s).toHaveLength(10);
  });

  it('buildGrooveRequest carries the genre', () => {
    expect(buildGrooveRequest(center, 0, '2020-03', ['temperature'], 'trap').genre).toBe('trap');
    expect('genre' in buildGrooveRequest(center, 0, '2020-03', ['temperature'])).toBe(false);
  });

  it('both: the date moves on by a month or a year per groove, kept inside the data', async () => {
    expect(bothDate('2020-03', 3, 'year')).toBe('2023-03');
    expect(bothDate('2020-03', 3, 'month')).toBe('2020-06');
    expect(bothDate('2020-03', 9, 'year', '2025-12')).toBe('2025-12');
    const fetchGroove = vi.fn(async (r: GrooveRequest) => grooveResponse(r));
    const res = await fetchVinylChunk({ ...req(3), travel: 'both', step: 'year', range_end: '2025-12' }, undefined, { fetchGroove });
    // the record starts in 2018-07
    expect(fetchGroove.mock.calls[0][0].time_period).toBe('2021-07');
    expect(res.periods).toEqual(['2021-07']);
    expect(res.next_chunk_index).toBe(4);
  });

  it('both: ends when the next date passes the end of the data, or after groove 10', async () => {
    const fetchGroove = vi.fn(async (r: GrooveRequest) => grooveResponse(r));
    const last = await fetchVinylChunk({ ...req(5), travel: 'both', step: 'year', range_end: '2023-12' }, undefined, { fetchGroove });
    // 2018-07 + 5 y = 2023-07; the next one (2024-07) is past 2023-12
    expect(last.next_chunk_index).toBeNull();
    const k9 = await fetchVinylChunk({ ...req(9), travel: 'both', step: 'month', range_end: '2030-01' }, undefined, { fetchGroove });
    expect(k9.next_chunk_index).toBeNull();
  });

  describe('time', () => {
    const zone = (tp: string, next: string | null, months: number): ZoneDataResponse => ({
      zone_id: null,
      dataset_ids: ['temperature'],
      time_period: tp,
      next_time_period: next,
      audio_data: 'AAAA',
      values: { temperature: 1.1 },
      point_count: 19,
      duration_s: 30,
      bar_starts_s: Array.from({ length: months }, (_, i) => (i * 30) / months),
    });

    it('chains zone-data chunks with next_time_period on a disc around the centre', async () => {
      const fetchZone = vi.fn(async (r: ZoneDataRequest) =>
        r.time_period === '2020-03' ? zone('2020-03', '2020-11', 8) : zone('2020-11', '2021-12', 13)
      );
      const fetchVinyl = vi.fn();
      const f = run(() => ({ timePeriod: '2020-03', center, travel: 'time', genre: 'house' }), fetchVinyl, fetchZone);
      const a = await f(player(0), new AbortController().signal);
      const b = await f(player(1), new AbortController().signal);
      expect(fetchVinyl).not.toHaveBeenCalled();
      expect(fetchZone.mock.calls[0][0]).toMatchObject({ time_period: '2020-03', genre: 'house', aggregation: 'mean' });
      expect(fetchZone.mock.calls[0][0].points.length).toBeGreaterThan(1);
      // groove 1 starts where groove 0 ended, not 10 months later
      expect(fetchZone.mock.calls[1][0].time_period).toBe('2020-11');
      expect(isVinylChunk(a) && a.vinyl.periods).toHaveLength(8);
      expect(isVinylChunk(b) && b.vinyl.periods).toHaveLength(13);
      expect(isVinylChunk(b) && b.vinyl.barStarts).toHaveLength(13);
      expect(a.time_period).toBe(syntheticPeriod(0));
      expect(a.next_time_period).toBe(syntheticPeriod(1));
      expect(a.duration_s).toBe(30);
    });

    it('estimates an unheard groove as the start plus 10 months per groove; null ends the side', async () => {
      const fetchZone = vi.fn(async (r: ZoneDataRequest) => zone(r.time_period, null, 5));
      const f = run(() => ({ timePeriod: '2020-03', center, travel: 'time' }), vi.fn(), fetchZone);
      const c = await f(player(4), new AbortController().signal);
      expect(fetchZone.mock.calls[0][0].time_period).toBe('2023-07');
      expect(c.next_time_period).toBeNull();
    });
  });

  it('periodAt finds the real month from the seconds in the groove', () => {
    const meta = { periods: ['2020-03', '2020-04', '2020-05'], barStarts: [0, 10, 20], timePeriod: '2020-03', travel: 'time' } as never;
    expect(periodAt(meta, 0)).toBe('2020-03');
    expect(periodAt(meta, 12)).toBe('2020-04');
    expect(periodAt(meta, 29.9)).toBe('2020-05');
    expect(dateSpan({})).toBeNull();
    expect(dateSpan({ 0: meta, 1: { ...(meta as object), chunkIndex: 1, periods: ['2020-06'] } as never })).toEqual({ first: '2020-03', last: '2020-06' });
  });
});
