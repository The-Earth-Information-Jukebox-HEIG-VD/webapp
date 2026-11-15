import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  VINYL_BASE_PERIOD,
  VINYL_END_PERIOD,
  buildGrooveRequest,
  chunkIndexOf,
  fetchVinylChunk,
  isVinylChunk,
  makeVinylChunkFetcher,
  meanValues,
  progressOfPosition,
  resetGrooveAvailability,
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
import { GROOVE_RADIUS_DEG, bandPoints, groovePath } from '../utils/vinylGeometry';

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

function zoneResponse(req: ZoneDataRequest): ZoneDataResponse {
  return {
    zone_id: req.zone_id,
    dataset_ids: req.dataset_ids,
    time_period: req.time_period,
    next_time_period: '2020-01',
    audio_data: 'AAAA',
    values: { temperature: 1.1 },
    point_count: req.points.length,
  };
}

function deps(overrides: Partial<VinylDeps> = {}): VinylDeps {
  return {
    fetchGroove: vi.fn(async (req: GrooveRequest) => grooveResponse(req)),
    fetchZoneData: vi.fn(async (req: ZoneDataRequest) => zoneResponse(req)),
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
  resetGrooveAvailability();
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
    expect(res.simulated).toBe(false);
    expect(d.fetchZoneData).not.toHaveBeenCalled();
  });

  it('ends after the tenth groove', async () => {
    expect((await fetchVinylChunk(req(9), undefined, deps())).next_chunk_index).toBeNull();
  });

  it('falls back to zone-data when the server has no groove route, and stays there', async () => {
    const fetchGroove = vi.fn(async () => {
      throw new ApiError(404, 'Not Found', 'noDataForPeriod');
    });
    const d = deps({ fetchGroove });
    const res = await fetchVinylChunk(req(2), undefined, d);
    expect(res.simulated).toBe(true);
    const zoneReq = (d.fetchZoneData as ReturnType<typeof vi.fn>).mock.calls[0][0] as ZoneDataRequest;
    expect(zoneReq.points).toEqual(bandPoints(center, 2));
    expect(zoneReq.time_period).toBe('2018-07');
    expect(res.stops).toHaveLength(groovePath(center, 2).path.length);
    expect(res.stops[0].values).toEqual({ temperature: 1.1 });

    await fetchVinylChunk(req(3), undefined, d);
    expect(fetchGroove).toHaveBeenCalledTimes(1);
  });

  it('passes real backend errors through', async () => {
    const err = new ApiError(400, 'No data at that date', 'noDataForPeriod');
    const d = deps({
      fetchGroove: vi.fn(async () => {
        throw err;
      }),
    });
    await expect(fetchVinylChunk(req(0), undefined, d)).rejects.toBe(err);
    expect(d.fetchZoneData).not.toHaveBeenCalled();
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
      simulated: false,
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
