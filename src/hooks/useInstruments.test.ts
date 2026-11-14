import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { instrumentToTrack, useInstruments, FALLBACK_TRACK_COLOR } from './useInstruments';
import { computeYearRange } from './useSonification';
import type { InstrumentInfo } from '../services/sonificationApi';

const base: InstrumentInfo = {
  dataset_id: 'temperature', variable: 'surface_temperature', label: 'Temperature',
  instrument: 'Piano (chords)', role: 'harmony', always_playing: true, units: 'degC',
  available: true, real_data: true, time_start: '1880-01-15T00:00:00Z', time_end: '2025-12-15T00:00:00Z',
  found_in: ['real_monthly_1880_2025'], midi_program: 0, pitch_range: [48, 72],
};

afterEach(() => vi.unstubAllGlobals());

describe('instrumentToTrack', () => {
  it('maps the backend row and enables temperature by default', () => {
    const t = instrumentToTrack(base);
    expect(t).toMatchObject({
      id: 'temperature', nameKey: 'tracks.temperature', label: 'Temperature',
      instrument: 'Piano (chords)', available: true, realData: true, defaultEnabled: true,
    });
    expect(t.period).toEqual({ start: base.time_start, end: base.time_end });
  });

  it('falls back to a neutral colour and is never default-enabled when unavailable', () => {
    const t = instrumentToTrack({ ...base, dataset_id: 'volcano', label: 'Volcano', available: false, time_start: null, time_end: null });
    expect(t.color).toBe(FALLBACK_TRACK_COLOR);
    expect(t.available).toBe(false);
    expect(t.defaultEnabled).toBe(false);
    expect(t.period).toBeNull();
  });
});

describe('computeYearRange', () => {
  it('spans the enabled tracks only', () => {
    const temp = instrumentToTrack(base);
    const rain = instrumentToTrack({ ...base, dataset_id: 'precipitation', time_start: '2000-01-01T00:00:00Z', time_end: '2026-06-01T00:00:00Z' });
    expect(computeYearRange([temp, rain], new Set(['temperature']))).toEqual({ start: 1880, end: 2025 });
    expect(computeYearRange([temp, rain], new Set(['temperature', 'precipitation']))).toEqual({ start: 1880, end: 2026 });
    expect(computeYearRange([temp, rain], new Set(['precipitation']))).toEqual({ start: 2000, end: 2026 });
  });
});

describe('useInstruments', () => {
  it('loads tracks and the preparing flag', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      new Response(JSON.stringify(url.endsWith('/health')
        ? { status: 'ok', preparing_data: true }
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
