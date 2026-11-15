import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { useLocalStorageString } from '../hooks/useLocalStorageString';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

/** localStorage key; index.html's no-flash script reads the same one. */
export const THEME_STORAGE_KEY = 'earth-jukebox-theme';

/** <meta name="theme-color"> per theme (the page background). Keep in sync with index.html. */
export const THEME_META_COLORS: Record<ResolvedTheme, string> = {
  dark: '#071327',
  light: '#f6f7fb',
};

const DARK_QUERY = '(prefers-color-scheme: dark)';

interface ThemeContextValue {
  /** What the user chose: follow the system, or force light / dark */
  preference: ThemePreference;
  /** The theme actually shown */
  resolvedTheme: ResolvedTheme;
  /** Switch to the opposite of the shown theme (saved as an explicit choice) */
  toggle: () => void;
  /** Set the preference directly ('system' goes back to following the OS) */
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function parsePreference(value: string | null): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia(DARK_QUERY).matches;
  } catch {
    return true; // the app was dark before themes existed
  }
}

/**
 * Light / dark theme. Follows the system (prefers-color-scheme) until the user
 * picks one with the header button; that choice is saved. The result is
 * written to <html data-theme="..."> (variables.css) and to the theme-color
 * meta tag. There is no animated transition, so nothing to turn off for
 * prefers-reduced-motion.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [saved, save] = useLocalStorageString(THEME_STORAGE_KEY);
  const preference = parsePreference(saved);
  const [systemDark, setSystemDark] = useState<boolean>(systemPrefersDark);

  // Follow OS changes only while the preference is 'system'
  useEffect(() => {
    if (preference !== 'system') return;
    let query: MediaQueryList;
    try {
      query = window.matchMedia(DARK_QUERY);
    } catch {
      return;
    }
    setSystemDark(query.matches);
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [preference]);

  const resolvedTheme: ResolvedTheme =
    preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', THEME_META_COLORS[resolvedTheme]);
  }, [resolvedTheme]);

  const setPreference = useCallback((next: ThemePreference) => save(next), [save]);
  const toggle = useCallback(
    () => save(resolvedTheme === 'dark' ? 'light' : 'dark'),
    [save, resolvedTheme]
  );

  const value = useMemo(
    () => ({ preference, resolvedTheme, toggle, setPreference }),
    [preference, resolvedTheme, toggle, setPreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Hook to read the theme and switch it */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}

export default ThemeContext;
