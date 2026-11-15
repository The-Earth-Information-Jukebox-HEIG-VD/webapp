import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVinylSettings } from './useVinylSettings';

let data: Map<string, string>;
beforeEach(() => {
  data = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('useVinylSettings travel', () => {
  it('defaults to space with a yearly step and persists changes next to the centre and month', () => {
    const { result } = renderHook(() => useVinylSettings([], new Set()));
    expect(result.current.travel).toBe('space');
    expect(result.current.step).toBe('year');
    act(() => result.current.setTravel('both'));
    act(() => result.current.setStep('month'));
    act(() => result.current.setTimePeriod('2001-02'));
    const saved = JSON.parse(data.get('earth-jukebox-vinyl')!);
    expect(saved).toMatchObject({ travel: 'both', step: 'month', period: '2001-02' });
    const again = renderHook(() => useVinylSettings([], new Set())).result.current;
    expect(again.travel).toBe('both');
    expect(again.step).toBe('month');
  });

  it('ignores invalid saved values', () => {
    data.set('earth-jukebox-vinyl', JSON.stringify({ travel: 'sideways', step: 'week' }));
    const { result } = renderHook(() => useVinylSettings([], new Set()));
    expect(result.current.travel).toBe('space');
    expect(result.current.step).toBe('year');
  });
});
