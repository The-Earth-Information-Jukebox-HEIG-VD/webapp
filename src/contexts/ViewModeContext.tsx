import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';

export type ViewMode = 'globe' | 'list';

interface ViewModeContextValue {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  toggleViewMode: () => void;
  isGlobeSupported: boolean;
}

const ViewModeContext = createContext<ViewModeContextValue | null>(null);

const VIEW_MODE_STORAGE_KEY = 'earth-jukebox-view-mode';

/**
 * Check if WebGL is supported in the current browser
 */
function checkWebGLSupport(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    return gl !== null;
  } catch {
    return false;
  }
}

interface ViewModeProviderProps {
  children: ReactNode;
}

/**
 * Provider component that manages globe vs list view mode
 *
 * Falls back to list view if WebGL is not supported.
 */
export function ViewModeProvider({ children }: ViewModeProviderProps) {
  const isGlobeSupported = checkWebGLSupport();

  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    // If WebGL not supported, always use list
    if (!isGlobeSupported) {
      return 'list';
    }

    // Try to load saved preference
    try {
      const saved = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
      if (saved === 'globe' || saved === 'list') {
        return saved;
      }
    } catch {
      console.warn('Failed to load view mode preference');
    }

    // Default to globe if supported
    return 'globe';
  });

  const setViewMode = useCallback(
    (mode: ViewMode) => {
      // Don't allow globe if not supported
      if (mode === 'globe' && !isGlobeSupported) {
        return;
      }

      setViewModeState(mode);
      try {
        localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
      } catch {
        console.warn('Failed to save view mode preference');
      }
    },
    [isGlobeSupported]
  );

  const toggleViewMode = useCallback(() => {
    setViewMode(viewMode === 'globe' ? 'list' : 'globe');
  }, [viewMode, setViewMode]);

  return (
    <ViewModeContext.Provider
      value={{ viewMode, setViewMode, toggleViewMode, isGlobeSupported }}
    >
      {children}
    </ViewModeContext.Provider>
  );
}

/**
 * Hook to access view mode state and controls
 */
export function useViewMode(): ViewModeContextValue {
  const context = useContext(ViewModeContext);
  if (!context) {
    throw new Error('useViewMode must be used within ViewModeProvider');
  }
  return context;
}

export default ViewModeContext;
