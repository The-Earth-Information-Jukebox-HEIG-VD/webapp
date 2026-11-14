/**
 * Data source types for each track - NASA SVS datasets
 */
export type DataSourceType =
  | 'co2_atmosphere'
  | 'co2_emissions'
  | 'night_lights'
  | 'temperature'
  | 'wildfires'
  | 'antarctica_melt'
  | 'lightning'
  | 'ecosystem'
  | 'deforestation';

/**
 * Map visualization type
 */
export type MapType = 'globe' | 'flat' | 'antarctic';

/**
 * Track definition for multi-track sonification
 *
 * Note: Instrument and frequency range info is fetched from the backend
 * via the /api/instruments endpoint and merged at runtime.
 * This keeps audio synthesis details on the backend where they belong.
 */
export interface Track {
  id: string;
  nameKey: string;
  descriptionKey: string;
  dataSource: DataSourceType;
  svsId: number;
  // Note: instrument and frequencyRange removed - now fetched from backend
  defaultVolume: number;
  defaultEnabled: boolean;
  color: string;
  mapType: MapType;
  period: {
    start: string;
    end: string;
  };
}

/**
 * Track state during playback
 */
export interface TrackState {
  id: string;
  enabled: boolean;
  volume: number;
  currentValue?: number;
}
