import { act } from '@testing-library/react';

/**
 * Replace window.matchMedia for one test: `(prefers-color-scheme: dark)` matches
 * when `dark` is true, and `setDark()` fires the "change" listeners like an OS
 * switch would. Returns a restore function.
 */
export function mockColorScheme(initialDark: boolean) {
  const original = window.matchMedia;
  let dark = initialDark;
  const listeners = new Set<(e: MediaQueryListEvent) => void>();

  window.matchMedia = ((query: string) => {
    const isDarkQuery = query.includes('prefers-color-scheme: dark');
    return {
      get matches() {
        return isDarkQuery ? dark : false;
      },
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => {
        if (isDarkQuery) listeners.add(fn);
      },
      removeEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => {
        listeners.delete(fn);
      },
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;

  return {
    setDark(next: boolean) {
      dark = next;
      act(() => listeners.forEach((fn) => fn({ matches: next } as MediaQueryListEvent)));
    },
    listenerCount: () => listeners.size,
    restore() {
      window.matchMedia = original;
    },
  };
}
