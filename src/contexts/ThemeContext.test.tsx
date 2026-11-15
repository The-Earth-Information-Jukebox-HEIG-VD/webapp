import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ThemeProvider, useTheme, THEME_STORAGE_KEY, THEME_META_COLORS } from './ThemeContext';
import { mockColorScheme } from '../test/mockMatchMedia';

const wrapper = ({ children }: { children: ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;

let media: ReturnType<typeof mockColorScheme>;
let meta: HTMLMetaElement;

function saveChoice(value: string | null) {
  vi.spyOn(window.localStorage, 'getItem').mockImplementation((key: string) =>
    key === THEME_STORAGE_KEY ? value : null
  );
}

beforeEach(() => {
  meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = '#000000';
  document.head.appendChild(meta);
});

afterEach(() => {
  media?.restore();
  vi.restoreAllMocks();
  meta.remove();
  document.documentElement.removeAttribute('data-theme');
});

describe('ThemeProvider', () => {
  it('follows a dark system by default', () => {
    media = mockColorScheme(true);
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.preference).toBe('system');
    expect(result.current.resolvedTheme).toBe('dark');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });

  it('follows a light system by default', () => {
    media = mockColorScheme(false);
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.resolvedTheme).toBe('light');
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
  });

  it('a saved choice wins over the system', () => {
    media = mockColorScheme(true);
    saveChoice('light');
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.preference).toBe('light');
    expect(result.current.resolvedTheme).toBe('light');
  });

  it('ignores an invalid saved value', () => {
    media = mockColorScheme(false);
    saveChoice('purple');
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.preference).toBe('system');
    expect(result.current.resolvedTheme).toBe('light');
  });

  it('follows system changes only while on system', () => {
    media = mockColorScheme(false);
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.resolvedTheme).toBe('light');
    media.setDark(true);
    expect(result.current.resolvedTheme).toBe('dark');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');

    // an explicit choice stops following the system
    act(() => result.current.setPreference('light'));
    expect(media.listenerCount()).toBe(0);
    media.setDark(false);
    media.setDark(true);
    expect(result.current.resolvedTheme).toBe('light');
  });

  it('toggle flips the shown theme and saves it', () => {
    media = mockColorScheme(true);
    const setItem = vi.spyOn(window.localStorage, 'setItem');
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => result.current.toggle());
    expect(result.current.resolvedTheme).toBe('light');
    expect(result.current.preference).toBe('light');
    expect(setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, 'light');
    act(() => result.current.toggle());
    expect(result.current.resolvedTheme).toBe('dark');
    expect(setItem).toHaveBeenLastCalledWith(THEME_STORAGE_KEY, 'dark');
  });

  it('updates data-theme and the theme-color meta', () => {
    media = mockColorScheme(true);
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(meta.content.toLowerCase()).toBe(THEME_META_COLORS.dark);
    act(() => result.current.toggle());
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(meta.content.toLowerCase()).toBe(THEME_META_COLORS.light);
  });

  it('useTheme needs the provider', () => {
    media = mockColorScheme(true);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useTheme())).toThrow(/ThemeProvider/);
    spy.mockRestore();
  });
});
