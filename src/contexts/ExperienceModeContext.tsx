import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

/**
 * Which experience the jukebox shows:
 * - 'zones': one zone, the music travels through time (the original mode);
 * - 'vinyl': one month, the music spirals across the globe like a record.
 */
export type ExperienceMode = 'zones' | 'vinyl';

interface ExperienceModeContextValue {
  mode: ExperienceMode;
  setMode: (mode: ExperienceMode) => void;
}

const ExperienceModeContext = createContext<ExperienceModeContextValue | null>(null);

export const EXPERIENCE_MODE_STORAGE_KEY = 'earth-jukebox-experience-mode';

function loadMode(): ExperienceMode {
  try {
    const saved = localStorage.getItem(EXPERIENCE_MODE_STORAGE_KEY);
    if (saved === 'zones' || saved === 'vinyl') return saved;
  } catch {
    /* storage unavailable */
  }
  return 'zones';
}

export function ExperienceModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ExperienceMode>(loadMode);

  const setMode = useCallback((next: ExperienceMode) => {
    setModeState(next);
    try {
      localStorage.setItem(EXPERIENCE_MODE_STORAGE_KEY, next);
    } catch {
      /* storage unavailable: the choice lasts for this visit only */
    }
  }, []);

  return <ExperienceModeContext.Provider value={{ mode, setMode }}>{children}</ExperienceModeContext.Provider>;
}

export function useExperienceMode(): ExperienceModeContextValue {
  const context = useContext(ExperienceModeContext);
  if (!context) throw new Error('useExperienceMode must be used within ExperienceModeProvider');
  return context;
}

export default ExperienceModeContext;
