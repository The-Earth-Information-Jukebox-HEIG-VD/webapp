import { useEffect, useMemo, useRef, useState } from 'react';
import type { ZoneFeature } from '../types/zones';
import { GRID_COLS, isDatasetSelected } from '../data/datasetRegistry';
import { getZoneGrid, type ZoneGrid } from '../utils/zoneCells';
import { fetchMonthRows, listDatasets, type VolumeDataset } from '../services/volumeData';

/** Stored values of one month: per dataset, one value per zone cell (null = month not covered). */
export type ZoneFrame = Map<string, Float32Array | null>;

export type ZoneDataStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface ZoneDataFrames {
  status: ZoneDataStatus;
  error: string | null;
  /** Volume datasets played by the selected audio tracks (the only ones drawn). */
  datasets: VolumeDataset[];
  grid: ZoneGrid | null;
  /** Month currently shown ('YYYY_MM'), may lag the requested month while loading. */
  month: string | null;
  frame: ZoneFrame | null;
}

const CACHE_SIZE = 24;

interface Options {
  feature: ZoneFeature | null;
  /** Requested month, 'YYYY_MM'. */
  month: string | null;
  /** Only load while the globe is in playback mode. */
  active: boolean;
  /**
   * Audio tracks selected in the track panel (backend dataset_id). Only the
   * datasets they play are downloaded and drawn. Omitted = every dataset.
   */
  enabledTrackIds?: ReadonlySet<string>;
}

/**
 * Loads the volume data for a zone, month by month, in step with playback.
 *
 * "Latest wins": at most one month is in flight; when it lands, the month that
 * is requested *now* is loaded next. Intermediate months are skipped when the
 * music is faster than the network, so the globe never lags behind the player.
 */
export function useZoneDataFrames({ feature, month, active, enabledTrackIds }: Options): ZoneDataFrames {
  const [allDatasets, setAllDatasets] = useState<VolumeDataset[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [shown, setShown] = useState<{ grid: ZoneGrid; month: string; frame: ZoneFrame } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Discover the volume once, when first needed
  useEffect(() => {
    if (!active || allDatasets.length) return;
    let cancelled = false;
    listDatasets()
      .then((list) => {
        if (cancelled) return;
        setAllDatasets(list);
        setListError(list.length ? null : 'No dataset found in the data volume');
      })
      .catch((err: unknown) => {
        if (!cancelled) setListError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [active, allDatasets.length]);

  // Same filter as the audio: only the datasets of the selected tracks.
  // Keyed on the selected ids so the list (and the loader) only change when
  // the selection does, not on every new Set instance.
  const selectionKey = enabledTrackIds ? [...enabledTrackIds].sort().join(',') : '*';
  const datasets = useMemo(() => {
    if (selectionKey === '*') return allDatasets;
    const enabled = new Set(selectionKey ? selectionKey.split(',') : []);
    return allDatasets.filter((ds) => isDatasetSelected(ds.info, enabled));
  }, [allDatasets, selectionKey]);

  // Grid cells of the zone (computed only when playback mode needs them)
  const grid = useMemo(() => (active && feature ? getZoneGrid(feature) : null), [active, feature]);

  const wantedRef = useRef<string | null>(null);
  // Loader bound to one (grid, datasets) pair; recreated when either changes
  const loaderRef = useRef<{ pump: () => void; abort: () => void } | null>(null);

  // Request the new month whenever playback moves on. Declared before the
  // loader effect so the wanted month is set before a new loader starts.
  useEffect(() => {
    wantedRef.current = month;
    if (active && month) loaderRef.current?.pump();
  }, [active, month]);

  useEffect(() => {
    if (!active || !grid || !datasets.length) return;
    const controller = new AbortController();
    const cache = new Map<string, ZoneFrame>();
    let inFlight = false;

    const load = async (m: string): Promise<ZoneFrame> => {
      const hit = cache.get(m);
      if (hit) return hit;
      const entries = await Promise.all(
        datasets.map(async (ds): Promise<[string, Float32Array | null]> => {
          if (!ds.monthSet.has(m)) return [ds.info.id, null];
          const runs = await Promise.all(
            grid.rowRuns.map(([r0, r1]) => fetchMonthRows(ds, m, r0, r1, controller.signal))
          );
          // Pick each zone cell's stored value out of the downloaded rows
          const values = new Float32Array(grid.cells.length);
          grid.cells.forEach((cell, i) => {
            const k = grid.rowRuns.findIndex(([r0, r1]) => cell.row >= r0 && cell.row <= r1);
            values[i] = runs[k][(cell.row - grid.rowRuns[k][0]) * GRID_COLS + cell.col];
          });
          fillUnknownDisplayRange(ds, values);
          return [ds.info.id, values];
        })
      );
      const frame: ZoneFrame = new Map(entries);
      cache.set(m, frame);
      if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string);
      return frame;
    };

    const pump = () => {
      const m = wantedRef.current;
      if (inFlight || !m || controller.signal.aborted) return;
      inFlight = true;
      load(m)
        .then((frame) => {
          if (controller.signal.aborted) return;
          setShown({ grid, month: m, frame });
          setLoadError(null);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setLoadError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => {
          inFlight = false;
          if (!controller.signal.aborted && wantedRef.current !== m) pump();
        });
    };

    loaderRef.current = { pump, abort: () => controller.abort() };
    pump();
    return () => {
      controller.abort();
      loaderRef.current = null;
    };
  }, [active, grid, datasets]);

  const current = shown && shown.grid === grid ? shown : null;
  const error = listError ?? loadError;
  let status: ZoneDataStatus = 'idle';
  if (active) {
    if (error) status = 'error';
    else if (allDatasets.length && !datasets.length) status = 'ready'; // no selected track has volume data
    else if (current) status = 'ready';
    else status = 'loading';
  }

  return {
    status,
    error: active ? error : null,
    datasets,
    grid,
    month: current?.month ?? null,
    frame: current?.frame ?? null,
  };
}

/**
 * Datasets missing from the registry have no display range: take it from the
 * first values seen (display only, the values are untouched).
 */
function fillUnknownDisplayRange(ds: VolumeDataset, values: Float32Array) {
  const d = ds.info.display;
  if (Number.isFinite(d.min) && Number.isFinite(d.max)) return;
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (Number.isNaN(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min < max) {
    ds.info.display = { ...d, min, max };
  }
}
