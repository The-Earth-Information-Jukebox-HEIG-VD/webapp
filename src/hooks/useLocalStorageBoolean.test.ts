import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLocalStorageBoolean } from './useLocalStorageBoolean';

const KEY = 'earth-jukebox-player-graph';

// Node's own experimental localStorage can shadow jsdom's: use an in-memory one
function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  };
}

let storage: ReturnType<typeof memoryStorage>;
beforeEach(() => {
  storage = memoryStorage();
  vi.stubGlobal('localStorage', storage);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useLocalStorageBoolean', () => {
  it('defaults to off and persists changes', () => {
    const { result } = renderHook(() => useLocalStorageBoolean(KEY, false));
    expect(result.current[0]).toBe(false);
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    expect(storage.getItem(KEY)).toBe('true');
    const again = renderHook(() => useLocalStorageBoolean(KEY, false));
    expect(again.result.current[0]).toBe(true);
  });

  it('ignores garbage and survives blocked storage', () => {
    storage.setItem(KEY, 'maybe');
    expect(renderHook(() => useLocalStorageBoolean(KEY, false)).result.current[0]).toBe(false);
    storage.getItem = () => {
      throw new Error('blocked');
    };
    storage.setItem = () => {
      throw new Error('blocked');
    };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useLocalStorageBoolean(KEY, true));
    expect(result.current[0]).toBe(true);
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
  });
});
