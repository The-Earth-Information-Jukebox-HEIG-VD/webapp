import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  sonify,
  fetchInstruments,
  ApiError,
  parseErrorDetail,
  periodToYear,
  yearToPeriod,
  type SonifyResponse,
} from './sonificationApi';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => vi.unstubAllGlobals());

describe('sonify', () => {
  it('posts dataset_id array, mean aggregation and the points unchanged', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ time_period: '1950-01', next_time_period: null, audio_data: 'AAAA' })
    );
    vi.stubGlobal('fetch', fetchMock);
    const points = [{ lat: 48.8, lng: 2.3, x: 512, y: 234 }];

    const res = (await sonify({
      zone_id: 'europe',
      dataset_id: ['temperature', 'precipitation'],
      points,
      time_period: '1950-01',
    })) as SonifyResponse;

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/sonify');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.dataset_id).toEqual(['temperature', 'precipitation']);
    expect(body.aggregation).toBe('mean');
    expect(body.points).toEqual(points);
    expect(body.time_period).toBe('1950-01');
    // null next_time_period = end of the data
    expect(res.next_time_period).toBeNull();
  });

  it('reads a string detail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ detail: 'unknown dataset_id' }, 400)));
    const err = await sonify({}).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.detail).toBe('unknown dataset_id');
    expect(err.kind).toBe('noDataForPeriod');
  });

  it('reads a 422 list of {loc, msg}', async () => {
    const detail = [{ loc: ['body', 'aggregation'], msg: 'Input should be mean' }];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ detail }, 422)));
    const err = await sonify({}).catch((e) => e);
    expect(err.detail).toBe('body.aggregation: Input should be mean');
  });

  it('maps network failures and proxy errors to backendUnavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    expect((await sonify({}).catch((e) => e)).kind).toBe('backendUnavailable');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Bad Gateway', { status: 502 })));
    expect((await sonify({}).catch((e) => e)).kind).toBe('backendUnavailable');
  });

  it('maps a 404 without JSON detail (another server on the API URL) to backendUnavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>404</html>', { status: 404 })));
    expect((await fetchInstruments().catch((e) => e)).kind).toBe('backendUnavailable');

    // A FastAPI 404 carries a detail and keeps its meaning
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ detail: 'zone not found' }, 404)));
    expect((await sonify({}).catch((e) => e)).kind).toBe('noDataForPeriod');
  });

  it('maps a 503 with detail to serverPreparing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ detail: 'audio rendering is not available' }, 503)));
    expect((await sonify({}).catch((e) => e)).kind).toBe('serverPreparing');
  });

  it('rethrows aborts untouched', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')));
    const err = await sonify({}).catch((e) => e);
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
});
