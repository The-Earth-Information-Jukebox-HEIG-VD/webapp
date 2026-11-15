import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useZoneSeries, clearZoneSeriesCache } from './useZoneSeries';
import type { GridPoint } from '../types/zones';

const pt = (lat: number, lng: number): GridPoint => ({ lat, lng, x: 0, y: 0 });
const EUROPE = [pt(48, 2), pt(49, 3)];
const AFRICA = [pt(0, 20), pt(1, 21)];

function body(ids: string[]) {
  return {
    zone_id: 'z',
    step: 'month',
    point_count: 2,
    series: Object.fromEntries(
      ids.map((id) => [id, { units: 'ppm', anomaly: false, start: '2000-01', yearly: false, values: [1, 2] }])
    ),
    missing: [],
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  clearZoneSeriesCache();
  fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const req = JSON.parse(init.body as string) as { dataset_ids: string[] };
    return new Response(JSON.stringify(body(req.dataset_ids)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('useZoneSeries', () => {
  it('does not fetch while inactive', () => {
    const { result } = renderHook(() =>
      useZoneSeries({ zoneId: 'europe', points: EUROPE, datasetIds: ['temperature'], active: false })
    );
    expect(result.current.status).toBe('idle');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches only the ids that are not cached', async () => {
    const { result, rerender } = renderHook(
      ({ ids }: { ids: string[] }) =>
        useZoneSeries({ zoneId: 'europe', points: EUROPE, datasetIds: ids, active: true }),
      { initialProps: { ids: ['temperature'] } }
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    rerender({ ids: ['temperature', 'co2'] });
    await waitFor(() => expect(Object.keys(result.current.series).sort()).toEqual(['co2', 'temperature']));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const second = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(second.dataset_ids).toEqual(['co2']);
  });

  it('aborts the request when the zone changes', async () => {
    const signals: AbortSignal[] = [];
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      signals.push(init.signal as AbortSignal);
      return new Promise(() => {});
    });
    const { rerender } = renderHook(
      ({ points }: { points: GridPoint[] }) =>
        useZoneSeries({ zoneId: 'z', points, datasetIds: ['temperature'], active: true }),
      { initialProps: { points: EUROPE } }
    );
    await waitFor(() => expect(signals).toHaveLength(1));
    rerender({ points: AFRICA });
    await waitFor(() => expect(signals).toHaveLength(2));
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
  });

  it('reports an error and can retry', async () => {
    fetchMock.mockImplementationOnce(async () => new Response('x', { status: 502 }));
    const { result } = renderHook(() =>
      useZoneSeries({ zoneId: 'z', points: EUROPE, datasetIds: ['snow'], active: true })
    );
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.errorKind).toBe('backendUnavailable');
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });
});
