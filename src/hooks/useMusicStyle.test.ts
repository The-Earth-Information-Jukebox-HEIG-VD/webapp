import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useMusicStyle, MUSIC_STYLE_STORAGE_KEY } from './useMusicStyle';

const genres = {
  default: 'orchestra',
  genres: [
    { id: 'orchestra', name: 'Orchestra', bpm: 90, description: 'd1' },
    { id: 'funk', name: 'Funk', bpm: 105, description: 'd2' },
  ],
};

let data: Map<string, string>;
beforeEach(() => {
  data = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(genres), { status: 200 })));
});
afterEach(() => vi.unstubAllGlobals());

describe('useMusicStyle', () => {
  it('defaults to the server default once the list is known', async () => {
    const { result } = renderHook(() => useMusicStyle());
    expect(result.current.genre).toBeUndefined();
    await waitFor(() => expect(result.current.genre).toBe('orchestra'));
  });

  it('remembers the choice', async () => {
    const { result } = renderHook(() => useMusicStyle());
    await waitFor(() => expect(result.current.genres).toHaveLength(2));
    act(() => result.current.setGenre('funk'));
    expect(result.current.genre).toBe('funk');
    expect(data.get(MUSIC_STYLE_STORAGE_KEY)).toBe('funk');
  });

  it('ignores a saved style the server does not know', async () => {
    data.set(MUSIC_STYLE_STORAGE_KEY, 'polka');
    const { result } = renderHook(() => useMusicStyle());
    await waitFor(() => expect(result.current.genre).toBe('orchestra'));
  });

  it('sends no style when the server has no /api/genres', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"detail":"Not Found"}', { status: 404 })));
    data.set(MUSIC_STYLE_STORAGE_KEY, 'funk');
    const { result } = renderHook(() => useMusicStyle());
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.genre).toBeUndefined();
  });
});
