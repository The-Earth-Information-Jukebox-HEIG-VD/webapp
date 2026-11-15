import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchZoneSeries,
  isAbortError,
  ApiError,
  type ApiErrorKind,
  type DatasetSeries,
} from '../services/sonificationApi';
import type { GridPoint } from '../types/zones';

export type ZoneSeriesStatus = 'idle' | 'loading' | 'ready' | 'error';

/** area hash + dataset -> series (null: the server has no data for it). Module level: survives remounts. */
const cache = new Map<string, DatasetSeries | null>();

/** For tests. */
export function clearZoneSeriesCache(): void {
  cache.clear();
}

/** Cheap stable hash of the area (FNV-1a over the rounded coordinates). */
export function hashPoints(points: GridPoint[]): string {
  let h = 0x811c9dc5;
  for (const p of points) {
    const lat = Math.round(p.lat * 100);
    const lng = Math.round(p.lng * 100);
    h = Math.imul(h ^ lat, 0x01000193);
    h = Math.imul(h ^ lng, 0x01000193);
  }
  return `${points.length}:${(h >>> 0).toString(16)}`;
}

const cacheKey = (area: string, id: string) => `${area}|${id}`;

interface UseZoneSeriesOptions {
  zoneId: string | null;
  zoneName?: string | null;
  points: GridPoint[];
  datasetIds: string[];
  /** Nothing is fetched while false (graph switched off) */
  active: boolean;
}

export interface UseZoneSeriesResult {
  status: ZoneSeriesStatus;
  errorKind: ApiErrorKind | null;
  /** Series of the requested datasets that have data */
  series: Record<string, DatasetSeries>;
  retry: () => void;
}

/**
 * Full monthly series of the selected area (POST /api/zones/series) for the data graph.
 * Fetches only the datasets that are not cached yet, and only while `active`.
 */
export function useZoneSeries({
  zoneId,
  zoneName = null,
  points,
  datasetIds,
  active,
}: UseZoneSeriesOptions): UseZoneSeriesResult {
  const area = useMemo(() => (points.length > 0 ? hashPoints(points) : ''), [points]);
  const idsKey = useMemo(() => [...new Set(datasetIds)].sort().join(','), [datasetIds]);
  // Bumped when the cache gains entries, and on retry
  const [version, setVersion] = useState(0);
  const [failure, setFailure] = useState<{ key: string; kind: ApiErrorKind } | null>(null);

  const enabled = active && area !== '' && idsKey !== '';
  const ids = useMemo(() => (idsKey ? idsKey.split(',') : []), [idsKey]);
  const fetchKey = `${area}|${idsKey}|${version}`;

  // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` marks cache changes
  const missingIds = useMemo(() => ids.filter((id) => !cache.has(cacheKey(area, id))), [ids, area, version]);

  useEffect(() => {
    if (!enabled || missingIds.length === 0) return;
    const controller = new AbortController();
    fetchZoneSeries(
      {
        zone_id: zoneId,
        zone_name: zoneName,
        dataset_ids: missingIds,
        points,
        aggregation: 'mean',
      },
      controller.signal
    )
      .then((res) => {
        for (const id of missingIds) cache.set(cacheKey(area, id), res.series[id] ?? null);
        setFailure(null);
        setVersion((v) => v + 1);
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        setFailure({ key: fetchKey, kind: err instanceof ApiError ? err.kind : 'unknown' });
      });
    return () => controller.abort();
    // points are represented by `area`; zoneName is informative only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, missingIds, area, zoneId, fetchKey]);

  const series = useMemo(() => {
    const out: Record<string, DatasetSeries> = {};
    if (!enabled) return out;
    for (const id of ids) {
      const s = cache.get(cacheKey(area, id));
      if (s) out[id] = s;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` marks cache changes
  }, [enabled, ids, area, version]);

  const retry = useCallback(() => {
    setFailure(null);
    setVersion((v) => v + 1);
  }, []);

  const failed = failure !== null && failure.key === fetchKey;
  const status: ZoneSeriesStatus = !enabled
    ? 'idle'
    : missingIds.length === 0
      ? 'ready'
      : failed
        ? 'error'
        : 'loading';

  return { status, errorKind: failed ? failure.kind : null, series, retry };
}

export default useZoneSeries;
