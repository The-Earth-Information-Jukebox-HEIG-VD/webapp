import { useCallback, useMemo, useState } from 'react';
import type { Track } from '../types/tracks';
import { DEFAULT_VINYL_CENTER } from '../data/vinylPresets';
import { clampCenter, type LatLng } from '../utils/vinylGeometry';
import type { VinylStep, VinylTravel } from '../services/vinylApi';

const STORAGE_KEY = 'earth-jukebox-vinyl';

export type { VinylTravel, VinylStep };

export const VINYL_TRAVELS: readonly VinylTravel[] = ['space', 'time', 'both'];
export const VINYL_STEPS: readonly VinylStep[] = ['month', 'year'];

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

interface Saved {
  center?: LatLng;
  period?: string;
  travel?: VinylTravel;
  step?: VinylStep;
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Saved;
    const c = parsed.center;
    const center =
      c && Number.isFinite(c.lat) && Number.isFinite(c.lng) && Math.abs(c.lat) <= 90 ? c : undefined;
    const period = typeof parsed.period === 'string' && /^\d{4}-\d{2}$/.test(parsed.period) ? parsed.period : undefined;
    const travel = VINYL_TRAVELS.find((x) => x === parsed.travel);
    const step = VINYL_STEPS.find((x) => x === parsed.step);
    return { center, period, travel, step };
  } catch {
    return {};
  }
}

function save(value: { center: LatLng; period: string | null; travel: VinylTravel; step: VinylStep }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* storage unavailable: settings last for this visit only */
  }
}

/**
 * Settings of the vinyl record: its centre, the month it starts at, and what the
 * needle travels through (space, time, or both with a date step).
 * The month always stays inside the data of the enabled tracks: when the
 * selection changes, an out-of-range month is clamped (and `clamped` is set so
 * the UI can say so).
 */
export function useVinylSettings(tracks: Track[], enabledIds: ReadonlySet<string>) {
  const [initial] = useState(load);
  const [center, setCenterState] = useState<LatLng>(initial.center ?? DEFAULT_VINYL_CENTER);
  const [userPeriod, setUserPeriod] = useState<string | null>(initial.period ?? null);
  const [travel, setTravelState] = useState<VinylTravel>(initial.travel ?? 'space');
  const [step, setStepState] = useState<VinylStep>(initial.step ?? 'year');

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
      save({ center: next, period: userPeriod, travel, step });
    },
    [userPeriod, travel, step]
  );

  const setTimePeriod = useCallback(
    (period: string) => {
      setUserPeriod(period);
      save({ center, period, travel, step });
    },
    [center, travel, step]
  );

  const setTravel = useCallback(
    (next: VinylTravel) => {
      setTravelState(next);
      save({ center, period: userPeriod, travel: next, step });
    },
    [center, userPeriod, step]
  );

  const setStep = useCallback(
    (next: VinylStep) => {
      setStepState(next);
      save({ center, period: userPeriod, travel, step: next });
    },
    [center, userPeriod, travel]
  );

  return { center, setCenter, timePeriod, setTimePeriod, range, clamped, travel, setTravel, step, setStep };
}

export default useVinylSettings;
