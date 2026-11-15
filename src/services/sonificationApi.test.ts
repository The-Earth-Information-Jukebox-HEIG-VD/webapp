import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  fetchZoneData,
  fetchZoneSeries,
  monthsBetween,
  addMonths,
  fetchInstruments,
  ApiError,
  parseErrorDetail,
  periodToYear,
  yearToPeriod,
  type ZoneDataRequest,
  type ZoneDataResponse,
} from './sonificationApi';

function req(over: Partial<ZoneDataRequest> = {}): ZoneDataRequest {
  return {
    zone_id: 'europe', zone_name: 'Europe', dataset_ids: ['temperature', 'precipitation'],
    points: [], time_period: '2015-01', aggregation: 'mean', ...over,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => vi.unstubAllGlobals());

async function failure(call: Promise<unknown>): Promise<ApiError> {
  try {
    await call;
  } catch (e) {
    return e as ApiError;
  }
  throw new Error('expected the call to fail');
}

describe('fetchZoneData', () => {
  it('posts to /api/zones/zone-data with dataset_ids, mean aggregation and the points unchanged', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        zone_id: 'europe', dataset_ids: ['temperature'], time_period: '2025-06', next_time_period: null,
        audio_data: 'AAAA', values: { temperature: 1.4 }, point_count: 1,
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    const points = [{ lat: 48.8, lng: 2.3, x: 512, y: 234 }];

    const res: ZoneDataResponse = await fetchZoneData(req({ points }));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/zones/zone-data');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      zone_id: 'europe', zone_name: 'Europe', dataset_ids: ['temperature', 'precipitation'],
      points, time_period: '2015-01', aggregation: 'mean',
    });
    // null next_time_period = end of the data
    expect(res.next_time_period).toBeNull();
    expect(res.values.temperature).toBe(1.4);
  });

  it('reads a string detail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ detail: 'no usable data for this zone / selection' }, 400)));
    const err = await failure(fetchZoneData(req()));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.detail).toBe('no usable data for this zone / selection');
    expect(err.kind).toBe('noDataForPeriod');
  });

  it('reads a 422 list of {loc, msg}', async () => {
    const detail = [{ loc: ['body', 'aggregation'], msg: 'Input should be mean' }];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ detail }, 422)));
    const err = await failure(fetchZoneData(req()));
    expect(err.detail).toBe('body.aggregation: Input should be mean');
  });

  it('maps network failures and proxy errors to backendUnavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    expect((await failure(fetchZoneData(req()))).kind).toBe('backendUnavailable');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Bad Gateway', { status: 502 })));
    expect((await failure(fetchZoneData(req()))).kind).toBe('backendUnavailable');
  });

  it('maps a 404 without JSON detail (another server on the API URL) to backendUnavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>404</html>', { status: 404 })));
    expect((await failure(fetchInstruments())).kind).toBe('backendUnavailable');

    // A FastAPI 404 carries a detail and keeps its meaning
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ detail: 'zone not found' }, 404)));
    expect((await failure(fetchZoneData(req()))).kind).toBe('noDataForPeriod');
  });

  it('maps a 503 with detail to serverPreparing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ detail: 'audio rendering is not available' }, 503)));
    expect((await failure(fetchZoneData(req()))).kind).toBe('serverPreparing');
  });

  it('rethrows aborts untouched', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')));
    const err = await failure(fetchZoneData(req()));
    expect(err).not.toBeInstanceOf(ApiError);
    expect(err.name).toBe('AbortError');
  });
});

describe('fetchInstruments', () => {
  it('GETs /api/instruments', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ palette: 'orchestra', instruments: [], by_dataset: {} }));
    vi.stubGlobal('fetch', fetchMock);
    await fetchInstruments();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/instruments');
  });
});

describe('period helpers', () => {
  it('parseErrorDetail ignores unknown shapes', () => {
    expect(parseErrorDetail(null)).toBe('');
    expect(parseErrorDetail({ detail: 5 })).toBe('');
  });
  it('converts periods to fractional years and back', () => {
    expect(periodToYear('1950')).toBe(1950);
    expect(periodToYear('1950-07')).toBeCloseTo(1950.5, 5);
    expect(periodToYear('1880-01-15T00:00:00Z')).toBeGreaterThan(1880);
    expect(yearToPeriod(1950.5)).toBe('1950-07');
    expect(yearToPeriod(2025)).toBe('2025-01');
  });

  it('counts months between periods and adds months', () => {
    expect(monthsBetween('2015-01', '2015-11')).toBe(10);
    expect(monthsBetween('2015-11', '2016-02')).toBe(3);
    expect(addMonths('2015-11', 3)).toBe('2016-02');
    expect(addMonths('2025-12', 1)).toBe('2026-01');
  });
});

describe('fetchZoneSeries', () => {
  it('POSTs the area and returns the series', async () => {
    const body = {
      zone_id: 'europe', step: 'month', point_count: 2,
      series: { co2: { units: 'ppm', anomaly: false, start: '2002-07', yearly: false, values: [370, null] } },
      missing: ['fires'],
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(body));
    vi.stubGlobal('fetch', fetchMock);
    const res = await fetchZoneSeries({
      zone_id: 'europe', zone_name: 'Europe', dataset_ids: ['co2', 'fires'], points: [], aggregation: 'mean',
    });
    expect(res.series.co2.values).toEqual([370, null]);
    expect(res.missing).toEqual(['fires']);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/zones\/series$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string).dataset_ids).toEqual(['co2', 'fires']);
  });

  it('maps a 400 to noDataForPeriod', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ detail: 'Unknown dataset' }, 400)));
    const err = await failure(fetchZoneSeries({
      zone_id: null, zone_name: null, dataset_ids: ['x'], points: [], aggregation: 'mean',
    }));
    expect(err.kind).toBe('noDataForPeriod');
  });
});
