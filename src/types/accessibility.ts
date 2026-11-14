/**
 * Accessibility preferences stored by the user
 */
export interface AccessibilityPreferences {
  /** Use dyslexic-friendly font (Lexie Readable) */
  dyslexicFont: boolean;
  /** Use color-blind safe palette (blue/orange instead of red/green) */
  colorBlindMode: boolean;
  /** Reduce animations and motion */
  reducedMotion: boolean;
  /** High contrast mode for better visibility */
  highContrast: boolean;
}

/**
 * Default accessibility preferences
 * Dyslexic font and color-blind mode are enabled by default for accessibility
 */
export const DEFAULT_ACCESSIBILITY_PREFERENCES: AccessibilityPreferences = {
  dyslexicFont: true,
  colorBlindMode: true,
  reducedMotion: false,
  highContrast: false,
};

/**
 * Local storage key for accessibility preferences
 * Version 2: Changed defaults to enable dyslexicFont and colorBlindMode
 */
export const ACCESSIBILITY_STORAGE_KEY = 'earth-jukebox-accessibility-v2';
