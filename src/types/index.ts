/**
 * Represents a single climate data point
 */
export interface ClimateDataPoint {
  timestamp: Date;
  value: number;
  anomaly?: number;
}

/**
 * A complete climate dataset with metadata
 */
export interface ClimateDataset {
  id: string;
  name: string;
  source: string;
  unit: string;
  description: string;
  points: ClimateDataPoint[];
}

/**
 * Available dataset types
 */
export type DatasetType = 'gistemp' | 'power' | 'svs';

/**
 * Configuration for the sonification engine
 */
export interface SonificationConfig {
  /** Minimum frequency in Hz (lowest data value maps here) */
  minFrequency: number;
  /** Maximum frequency in Hz (highest data value maps here) */
  maxFrequency: number;
  /** Duration per data point in milliseconds */
  noteDuration: number;
  /** Gap between notes in milliseconds */
  noteGap: number;
  /** Oscillator waveform type */
  waveform: OscillatorType;
  /** Master volume (0-1) */
  volume: number;
  /** Attack time in seconds */
  attackTime: number;
  /** Release time in seconds */
  releaseTime: number;
}

/**
 * Sonification engine state
 */
export interface SonificationState {
  isPlaying: boolean;
  isPaused: boolean;
  currentIndex: number;
  progress: number;
}

/**
 * API response for climate data
 */
export interface ClimateDataResponse {
  dataset: ClimateDataset;
  meta: {
    fetchedAt: string;
    source: string;
    totalPoints: number;
  };
}

// Re-export other types
export * from './zones';
export * from './tracks';
export * from './keyMoments';
export * from './accessibility';
