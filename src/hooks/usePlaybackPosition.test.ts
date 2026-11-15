import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createPositionStore, usePlaybackPosition } from './usePlaybackPosition';

describe('createPositionStore', () => {
  it('notifies every listener on change and stops after unsubscribe', () => {
    const store = createPositionStore();
    const a = vi.fn();
    const b = vi.fn();
    const offA = store.subscribe(a);
    store.subscribe(b);
    store.set(1950);
    expect(store.get()).toBe(1950);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    offA();
    store.set(1951);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
  });

  it('is a no-op when the value is unchanged', () => {
    const store = createPositionStore(1950);
    const l = vi.fn();
    store.subscribe(l);
    store.set(1950);
    store.set(null);
    store.set(null);
    expect(l).toHaveBeenCalledTimes(1);
  });
});

describe('usePlaybackPosition', () => {
  it('a month selector re-renders only when the month changes', () => {
    const store = createPositionStore(1950);
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return usePlaybackPosition(store, (p) => Math.floor(((p ?? 0) % 1) * 12));
    });
    expect(result.current).toBe(0);
    const base = renders;
    act(() => store.set(1950.01));
    act(() => store.set(1950.05));
    expect(renders).toBe(base);
    act(() => store.set(1950 + 2 / 12));
    expect(renders).toBe(base + 1);
    expect(result.current).toBe(2);
  });

  it('without a selector returns the raw position', () => {
    const store = createPositionStore();
    const { result } = renderHook(() => usePlaybackPosition(store));
    expect(result.current).toBeNull();
    act(() => store.set(1990.5));
    expect(result.current).toBe(1990.5);
  });
});
