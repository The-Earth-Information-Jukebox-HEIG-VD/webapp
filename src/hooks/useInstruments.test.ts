import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { instrumentToTrack, useInstruments, FALLBACK_TRACK_COLOR } from './useInstruments';
import { computeYearRange, computeTimelineEnd } from './useSonification';
import type { InstrumentInfo } from '../services/sonificationApi';

const base: InstrumentInfo = {
  dataset_id: 'temperature', name: 'Temperature', instrument: 'Piano (chords)', units: 'degC anomaly',
  first_time_period: '1880-01', last_time_period: '2025-12', midi_program: 0, pitch_range: [48, 72],
  role: 'harmony', always_playing: true,
};

afterEach(() => vi.unstubAllGlobals());

describe('instrumentToTrack', () => {
  it('maps the live row: name becomes label, listed means available, temperature is on by default', () => {
    const t = instrumentToTrack(base);
    expect(t).toMatchObject({
      id: 'temperature', nameKey: 'tracks.temperature', label: 'Temperature',
      instrument: 'Piano (chords)', units: 'degC anomaly', available: true, defaultEnabled: true,
    });
    // the app starts in 1920: earlier months are clipped
    expect(t.period).toEqual({ start: '1920-01', end: '2025-12' });
  });

  it('keeps periods that start after 1920 and drops those that end before', () => {
    expect(instrumentToTrack({ ...base, first_time_period: '2002-09' }).period).toEqual({ start: '2002-09', end: '2025-12' });
    expect(instrumentToTrack({ ...base, last_time_period: '1919-12' }).period).toBeNull();
  });

  it('gives other datasets a colour or the neutral fallback and leaves them off', () => {
    const night = instrumentToTrack({ ...base, dataset_id: 'night_lights', name: 'Night lights' });
    expect(night.color).not.toBe(FALLBACK_TRACK_COLOR);
    expect(night.defaultEnabled).toBe(false);
    expect(instrumentToTrack({ ...base, dataset_id: 'volcano', name: 'Volcano' }).color).toBe(FALLBACK_TRACK_COLOR);
  });
});

describe('timeline range', () => {
  const temp = instrumentToTrack(base);
  const rain = instrumentToTrack({
    ...base, dataset_id: 'precipitation', first_time_period: '2000-06', last_time_period: '2026-11',
  });

  it('spans the enabled tracks only, in whole years', () => {
    expect(computeYearRange([temp, rain], new Set(['temperature']))).toEqual({ start: 1920, end: 2025 });
    expect(computeYearRange([temp, rain], new Set(['temperature', 'precipitation']))).toEqual({ start: 1920, end: 2026 });
    expect(computeYearRange([temp, rain], new Set(['precipitation']))).toEqual({ start: 2000, end: 2026 });
  });

  it('ends the fractional timeline one month after the last data month', () => {
    expect(computeTimelineEnd([temp], new Set(['temperature']))).toBeCloseTo(2026, 5); // after 2025-12
    expect(computeTimelineEnd([temp, rain], new Set(['precipitation']))).toBeCloseTo(2026 + 11 / 12, 5); // after 2026-11
  });
});

describe('useInstruments', () => {
  it('loads tracks and the preparing flag', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      new Response(JSON.stringify(url.endsWith('/health')
        ? { status: 'ok', preparing_data: true, full_api: false }
        : { palette: 'orchestra', by_dataset: {}, instruments: [base] }), { status: 200 })));
    const { result } = renderHook(() => useInstruments());
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.tracks).toHaveLength(1);
    expect(result.current.preparing).toBe(true);
  });

  it('reports backendUnavailable when the server is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const { result } = renderHook(() => useInstruments());
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.errorKind).toBe('backendUnavailable');
  });
});
