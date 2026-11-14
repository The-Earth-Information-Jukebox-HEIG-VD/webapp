import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import {
  type AccessibilityPreferences,
  DEFAULT_ACCESSIBILITY_PREFERENCES,
  ACCESSIBILITY_STORAGE_KEY,
} from '../types/accessibility';

interface AccessibilityContextValue {
  preferences: AccessibilityPreferences;
  updatePreference: <K extends keyof AccessibilityPreferences>(
    key: K,
    value: AccessibilityPreferences[K]
  ) => void;
  resetPreferences: () => void;
}

const AccessibilityContext = createContext<AccessibilityContextValue | null>(null);

interface AccessibilityProviderProps {
  children: ReactNode;
}

/**
 * Provider component that manages accessibility preferences
 *
 * Persists preferences to localStorage and applies CSS classes
 * to the document root for styling hooks.
 */
export function AccessibilityProvider({ children }: AccessibilityProviderProps) {
  const [preferences, setPreferences] = useState<AccessibilityPreferences>(() => {
    // Load saved preferences from localStorage
    try {
      const saved = localStorage.getItem(ACCESSIBILITY_STORAGE_KEY);
      if (saved) {
        return { ...DEFAULT_ACCESSIBILITY_PREFERENCES, ...JSON.parse(saved) };
      }
    } catch {
      console.warn('Failed to load accessibility preferences');
    }

    // Check system preference for reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    return {
      ...DEFAULT_ACCESSIBILITY_PREFERENCES,
      reducedMotion: prefersReducedMotion,
    };
  });

  // Persist preferences to localStorage and apply CSS classes
  useEffect(() => {
    try {
      localStorage.setItem(ACCESSIBILITY_STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      console.warn('Failed to save accessibility preferences');
    }

    // Apply CSS classes to document root
    const root = document.documentElement;
    root.classList.toggle('dyslexic-font', preferences.dyslexicFont);
    root.classList.toggle('color-blind-mode', preferences.colorBlindMode);
    root.classList.toggle('reduced-motion', preferences.reducedMotion);
    root.classList.toggle('high-contrast', preferences.highContrast);
  }, [preferences]);

  // Listen for system reduced motion preference changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (e: MediaQueryListEvent) => {
      setPreferences((prev) => ({
        ...prev,
        reducedMotion: e.matches,
      }));
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const updatePreference = useCallback(
    <K extends keyof AccessibilityPreferences>(
      key: K,
      value: AccessibilityPreferences[K]
    ) => {
      setPreferences((prev) => ({
        ...prev,
        [key]: value,
      }));
    },
    []
  );

  const resetPreferences = useCallback(() => {
    setPreferences(DEFAULT_ACCESSIBILITY_PREFERENCES);
  }, []);

  return (
    <AccessibilityContext.Provider
      value={{ preferences, updatePreference, resetPreferences }}
    >
      {children}
    </AccessibilityContext.Provider>
  );
}

/**
 * Hook to access accessibility preferences and controls
 */
export function useAccessibility(): AccessibilityContextValue {
  const context = useContext(AccessibilityContext);
  if (!context) {
    throw new Error('useAccessibility must be used within AccessibilityProvider');
  }
  return context;
}

export default AccessibilityContext;
