import { useCallback, useMemo, useState } from 'react';
import type { Track } from '../types/tracks';
import { DEFAULT_VINYL_CENTER } from '../data/vinylPresets';
import { clampCenter, type LatLng } from '../utils/vinylGeometry';

const STORAGE_KEY = 'earth-jukebox-vinyl';

export interface VinylPeriodRange {
  /** First month with data for every enabled track, "YYYY-MM" */
  start: string;
  /** Last month with data for every enabled track, "YYYY-MM" */
  end: string;
  /** The enabled tracks share no month: the range is their union instead */
  disjoint: boolean;
}

const FALLBACK_RANGE: VinylPeriodRange = { start: '1880-01', end: '2025-12', disjoint: false };

/** Months for which all enabled tracks have data (or their union if they do not overlap). */
export function commonPeriod(tracks: Track[], enabledIds: ReadonlySet<string>): VinylPeriodRange {
  const withPeriod = (list: Track[]) => list.filter((t) => t.period).map((t) => t.period!);
  let periods = withPeriod(tracks.filter((t) => enabledIds.has(t.id)));
  if (periods.length === 0) periods = withPeriod(tracks);
  if (periods.length === 0) return FALLBACK_RANGE;
  const starts = periods.map((p) => p.start.slice(0, 7)).sort();
  const ends = periods.map((p) => p.end.slice(0, 7)).sort();
  const start = starts.at(-1)!;
  const end = ends[0];
  if (start <= end) return { start, end, disjoint: false };
  return { start: starts[0], end: ends.at(-1)!, disjoint: true };
}

function load(): { center?: LatLng; period?: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { center?: LatLng; period?: string };
    const c = parsed.center;
    const center =
      c && Number.isFinite(c.lat) && Number.isFinite(c.lng) && Math.abs(c.lat) <= 90 ? c : undefined;
    const period = typeof parsed.period === 'string' && /^\d{4}-\d{2}$/.test(parsed.period) ? parsed.period : undefined;
    return { center, period };
  } catch {
    return {};
  }
}

function save(center: LatLng, period: string | null) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ center, period }));
  } catch {
    /* storage unavailable: settings last for this visit only */
  }
}

/**
 * Settings of the vinyl record: its centre and the month it plays.
 * The month always stays inside the data of the enabled tracks: when the
 * selection changes, an out-of-range month is clamped (and `clamped` is set so
 * the UI can say so).
 */
export function useVinylSettings(tracks: Track[], enabledIds: ReadonlySet<string>) {
  const [initial] = useState(load);
  const [center, setCenterState] = useState<LatLng>(initial.center ?? DEFAULT_VINYL_CENTER);
  const [userPeriod, setUserPeriod] = useState<string | null>(initial.period ?? null);

  const range = useMemo(() => commonPeriod(tracks, enabledIds), [tracks, enabledIds]);

  const timePeriod = useMemo(() => {
    if (!userPeriod) return range.end;
    if (userPeriod < range.start) return range.start;
    if (userPeriod > range.end) return range.end;
    return userPeriod;
  }, [userPeriod, range]);
  const clamped = userPeriod !== null && userPeriod !== timePeriod;

  const setCenter = useCallback(
    (c: LatLng) => {
      // Keep the exact pole (presets) but normalise the longitude
      const next = { lat: Math.max(-90, Math.min(90, c.lat)), lng: clampCenter(c).lng };
      setCenterState(next);
      save(next, userPeriod);
    },
    [userPeriod]
  );

  const setTimePeriod = useCallback(
    (period: string) => {
      setUserPeriod(period);
      save(center, period);
    },
    [center]
  );

  return { center, setCenter, timePeriod, setTimePeriod, range, clamped };
}

export default useVinylSettings;
