import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVinylSonification } from './useVinylSonification';
import { makeVinylChunkFetcher, type VinylConfig, type VinylRequest, type VinylResponse } from '../services/vinylApi';
import { MockAudioContext } from '../test/setup';

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

function setup(initial: {
  datasetIds: string[];
  center: { lat: number; lng: number };
  timePeriod: string;
  travel?: 'space' | 'time' | 'both';
  step?: 'month' | 'year';
  genre?: string;
}) {
  const requests: { req: VinylRequest; signal?: AbortSignal }[] = [];
  const fetchVinyl = vi.fn(
    (req: VinylRequest, signal?: AbortSignal) =>
      new Promise<VinylResponse>((resolve) => {
        requests.push({ req, signal });
        const k = req.chunk_index;
        // Groove 3 stays in flight (to test aborts)
        if (k === 3) return;
        resolve({
          dataset_ids: req.dataset_ids,
          time_period: req.time_period,
          center: req.center,
          chunk_index: k,
          next_chunk_index: k < 9 ? k + 1 : null,
          chunk_count: 10,
          stops: [{ lat: req.center.lat, lng: req.center.lng, values: { temperature: 0.5 } }],
          stop_seconds: 30,
          radius_deg: 2,
          audio_data: 'AAAA',
          values: { temperature: 0.5 },
        });
      })
  );
  const makeFetcher = (getConfig: () => VinylConfig) => makeVinylChunkFetcher(getConfig, fetchVinyl);
  const hook = renderHook((props) => useVinylSonification({ ...props, makeFetcher }), { initialProps: initial });
  return { hook, requests, fetchVinyl };
}

beforeEach(() => {
  MockAudioContext.sources.length = 0;
});

describe('useVinylSonification', () => {
  const base = { datasetIds: ['temperature'], center: { lat: 50, lng: 10 }, timePeriod: '2020-03' };

  it('cannot play without tracks', () => {
    const { hook } = setup({ ...base, datasetIds: [] });
    expect(hook.result.current.canPlay).toBe(false);
  });

  it('plays groove 1 with the chosen centre and month', async () => {
    const { hook, requests } = setup(base);
    await act(async () => {
      await hook.result.current.play();
      await flush();
    });
    expect(requests[0].req).toMatchObject({ chunk_index: 0, time_period: '2020-03', center: base.center });
    expect(hook.result.current.isPlaying).toBe(true);
    expect(hook.result.current.chunkIndex).toBe(0);
  });

  it('restarts from the rim when the centre changes', async () => {
    const { hook, requests } = setup(base);
    await act(async () => {
      await hook.result.current.play();
      await flush();
    });
    await act(async () => {
      hook.result.current.seekToChunk(3);
      await flush();
    });
    expect(requests.at(-1)!.req.chunk_index).toBe(3);
    const before = requests.at(-1)!.signal!;

    await act(async () => {
      hook.rerender({ ...base, center: { lat: -20, lng: 80 } });
      await flush();
    });
    expect(before.aborted).toBe(true);
    expect(requests.at(-1)!.req).toMatchObject({ chunk_index: 0, center: { lat: -20, lng: 80 } });
  });

  it.each([
    ['travel mode', { travel: 'both' as const }],
    ['style', { genre: 'funk' }],
  ])('lifts the needle back to the rim and aborts the old request when the %s changes', async (_name, change) => {
    const { hook, requests } = setup(base);
    await act(async () => {
      await hook.result.current.play();
      await flush();
    });
    await act(async () => {
      hook.result.current.seekToChunk(3);
      await flush();
    });
    const before = requests.at(-1)!.signal!;
    await act(async () => {
      hook.rerender({ ...base, ...change });
      await flush();
    });
    expect(before.aborted).toBe(true);
    expect(requests.at(-1)!.req).toMatchObject({ chunk_index: 0, ...change });
  });

  it('moves between grooves', async () => {
    const { hook, requests } = setup(base);
    await act(async () => {
      await hook.result.current.play();
      await flush();
    });
    await act(async () => {
      hook.result.current.nextGroove();
      await flush();
    });
    expect(requests.at(-1)!.req.chunk_index).toBe(1);
    expect(hook.result.current.chunkIndex).toBe(1);
    await act(async () => {
      hook.result.current.prevGroove();
      await flush();
    });
    expect(requests.at(-1)!.req.chunk_index).toBe(0);
  });

  it('keeps the fine position in the store, the groove number in state', async () => {
    const { hook } = setup(base);
    await act(async () => {
      await hook.result.current.play();
      await flush();
    });
    const store = hook.result.current.positionStore;
    expect(store.get()).toBeCloseTo(2000);
    await act(async () => {
      hook.result.current.seekToChunk(5);
      await flush();
    });
    expect(hook.result.current.chunkIndex).toBe(5);
    expect(store.get()).toBeCloseTo(2000 + 50 / 12);
  });
});
