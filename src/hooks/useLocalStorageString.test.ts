import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLocalStorageString } from './useLocalStorageString';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  };
}

beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()));
afterEach(() => vi.unstubAllGlobals());

describe('useLocalStorageString', () => {
  it('starts empty, persists and reads back', () => {
    const { result, unmount } = renderHook(() => useLocalStorageString('k'));
    expect(result.current[0]).toBeNull();
    act(() => result.current[1]('funk'));
    expect(result.current[0]).toBe('funk');
    unmount();
    expect(renderHook(() => useLocalStorageString('k')).result.current[0]).toBe('funk');
  });

  it('survives blocked storage', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { result } = renderHook(() => useLocalStorageString('k'));
    expect(result.current[0]).toBeNull();
    act(() => result.current[1]('house'));
    expect(result.current[0]).toBe('house');
  });
});
