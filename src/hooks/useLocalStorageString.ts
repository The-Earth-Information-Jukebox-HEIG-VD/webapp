import { useCallback, useState } from 'react';

/**
 * A string preference persisted in localStorage (the string twin of
 * useLocalStorageBoolean). Storage can be missing or blocked: the value then
 * lives in memory only. `null` = nothing saved yet; the caller validates it
 * (e.g. against a list that is only known later).
 */
export function useLocalStorageString(key: string): [string | null, (value: string) => void] {
  const [value, setValueState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(key);
    } catch {
      console.warn(`Failed to load preference ${key}`);
      return null;
    }
  });

  const setValue = useCallback(
    (next: string) => {
      setValueState(next);
      try {
        localStorage.setItem(key, next);
      } catch {
        console.warn(`Failed to save preference ${key}`);
      }
    },
    [key]
  );

  return [value, setValue];
}

export default useLocalStorageString;
