import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { KNOWN_DATASETS, GRID_COLS, isDatasetSelected } from '../data/datasetRegistry';
import { findZoneFeature } from '../data/zones';
import type { VolumeDataset } from '../services/volumeData';
import { useZoneDataFrames } from './useZoneDataFrames';

const volume: VolumeDataset[] = KNOWN_DATASETS.map((info) => ({
  info,
  months: ['2020_07'],
  monthSet: new Set(['2020_07']),
}));

const fetchMonthRows = vi.fn(
  async (_ds: VolumeDataset, _m: string, r0: number, r1: number) =>
    new Float32Array((r1 - r0 + 1) * GRID_COLS).fill(1)
);

vi.mock('../services/volumeData', () => ({
  listDatasets: () => Promise.resolve(volume),
  fetchMonthRows: (...args: Parameters<typeof fetchMonthRows>) => fetchMonthRows(...args),
}));

const switzerland = findZoneFeature('switzerland')!;

describe('globe datasets follow the selected audio tracks', () => {
  beforeEach(() => fetchMonthRows.mockClear());

  it('maps backend track ids to volume datasets', () => {
    const byId = Object.fromEntries(KNOWN_DATASETS.map((d) => [d.id, d]));
    expect(isDatasetSelected(byId.temperature_anomaly, new Set(['temperature']))).toBe(true);
    expect(isDatasetSelected(byId.rain, new Set(['precipitation']))).toBe(true);
    expect(isDatasetSelected(byId.snow, new Set(['snowfall']))).toBe(true);
    expect(isDatasetSelected(byId.co2, new Set(['temperature', 'lightning']))).toBe(false);
  });

  it('downloads and returns only the datasets of the enabled tracks', async () => {
    const { result, rerender } = renderHook((props) => useZoneDataFrames(props), {
      initialProps: {
        feature: switzerland,
        month: '2020_07',
        active: true,
        enabledTrackIds: new Set(['temperature', 'lightning']) as ReadonlySet<string>,
      },
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.datasets.map((d) => d.info.id)).toEqual(['temperature_anomaly', 'lightning']);
    expect([...result.current.frame!.keys()]).toEqual(['temperature_anomaly', 'lightning']);
    const fetched = new Set(fetchMonthRows.mock.calls.map(([ds]) => ds.info.id));
    expect(fetched).toEqual(new Set(['temperature_anomaly', 'lightning']));

    // Switching lightning off and rain on in the track panel
    fetchMonthRows.mockClear();
    rerender({
      feature: switzerland,
      month: '2020_07',
      active: true,
      enabledTrackIds: new Set(['temperature', 'precipitation']),
    });
    await waitFor(() =>
      expect([...(result.current.frame?.keys() ?? [])]).toEqual(['temperature_anomaly', 'rain'])
    );
    expect(result.current.datasets.map((d) => d.info.id)).toEqual(['temperature_anomaly', 'rain']);
    expect(fetchMonthRows.mock.calls.some(([ds]) => ds.info.id === 'lightning')).toBe(false);
  });

  it('shows nothing (but is not stuck loading) when no selected track has volume data', async () => {
    const { result } = renderHook(() =>
      useZoneDataFrames({ feature: switzerland, month: '2020_07', active: true, enabledTrackIds: new Set(['dust']) })
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.datasets).toEqual([]);
    expect(fetchMonthRows).not.toHaveBeenCalled();
  });
});
