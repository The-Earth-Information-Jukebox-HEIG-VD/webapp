import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSonification } from './useSonification';
import type { Track } from '../types/tracks';

function track(id: string, start: string, end: string, defaultEnabled: boolean): Track {
  return {
    id, nameKey: `tracks.${id}`, label: id, instrument: '', role: '', available: true,
    alwaysPlaying: true, units: null, period: { start, end }, color: '#fff', defaultEnabled,
  };
}

// Default selection ends in 2012: a seek to 2022 would be clamped if it ran first
const TRACKS = [
  track('night_lights', '1992-01', '2012-12', true),
  track('precipitation', '2000-06', '2024-12', false),
  track('fires', '2001-01', '2024-12', false),
];

afterEach(() => vi.useRealTimers());

function setup() {
  return renderHook(() =>
    useSonification({ tracks: TRACKS, points: [], zoneId: null, zoneName: null })
  );
}

describe('useSonification jumpTo', () => {
  it('selects only the given tracks, then seeks inside their new range', () => {
    vi.useFakeTimers();
    const { result } = setup();
    act(() => result.current.jumpTo(['precipitation'], 2022.5));
    expect(result.current.trackStates.filter((t) => t.enabled).map((t) => t.id)).toEqual([
      'precipitation',
    ]);
    expect(result.current.positionStore.get()).toBeCloseTo(2022.5);
  });

  it('seeks at once when the tracks are already selected', () => {
    vi.useFakeTimers();
    const { result } = setup();
    act(() => result.current.jumpTo(['night_lights'], 2005));
    expect(result.current.positionStore.get()).toBeCloseTo(2005);
  });

  it('keeps the selection when the event dataset is not on the server', () => {
    vi.useFakeTimers();
    const { result } = setup();
    act(() => result.current.jumpTo(['snow'], 2010));
    expect(result.current.trackStates.filter((t) => t.enabled).map((t) => t.id)).toEqual([
      'night_lights',
    ]);
    expect(result.current.positionStore.get()).toBeCloseTo(2010);
  });
});
