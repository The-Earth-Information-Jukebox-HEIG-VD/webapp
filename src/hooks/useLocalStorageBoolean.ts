import { useCallback, useState } from 'react';

/**
 * A boolean preference persisted in localStorage (same try/catch pattern as
 * ViewModeContext: storage can be missing or blocked, the value then lives in memory only).
 */
export function useLocalStorageBoolean(
  key: string,
  defaultValue = false
): [boolean, (value: boolean) => void] {
  const [value, setValueState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved === 'true') return true;
      if (saved === 'false') return false;
    } catch {
      console.warn(`Failed to load preference ${key}`);
    }
    return defaultValue;
  });

  const setValue = useCallback(
    (next: boolean) => {
      setValueState(next);
      try {
        localStorage.setItem(key, String(next));
      } catch {
        console.warn(`Failed to save preference ${key}`);
      }
    },
    [key]
  );

  return [value, setValue];
}

export default useLocalStorageBoolean;
