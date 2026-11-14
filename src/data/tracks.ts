import type { Track } from '../types/tracks';

/**
 * Available audio tracks for multi-track sonification
 *
 * Each track represents a NASA SVS dataset. The static metadata
 * (UI strings, colors, time periods) lives here in the frontend.
 *
 * Instrument assignments and frequency ranges are fetched from the
 * backend via /api/instruments - this keeps audio synthesis details
 * where they belong and allows dynamic instrument palette changes.
 *
 * SVS IDs reference NASA Scientific Visualization Studio datasets.
 */
export const tracks: Track[] = [
  {
    id: 'co2_atmosphere',
    nameKey: 'tracks.co2Atmosphere',
    descriptionKey: 'tracks.co2AtmosphereDesc',
    dataSource: 'co2_atmosphere',
    svsId: 5196,
    defaultVolume: 0.5,
    defaultEnabled: false,
    color: '#8e44ad',
    mapType: 'globe',
    period: { start: '2014-09', end: '2024-08' },
  },
  {
    id: 'co2_emissions',
    nameKey: 'tracks.co2Emissions',
    descriptionKey: 'tracks.co2EmissionsDesc',
    dataSource: 'co2_emissions',
    svsId: 5121,
    defaultVolume: 0.4,
    defaultEnabled: false,
    color: '#9b59b6',
    mapType: 'globe',
    period: { start: '2020-01', end: '2022-12' },
  },
  {
    id: 'night_lights',
    nameKey: 'tracks.nightLights',
    descriptionKey: 'tracks.nightLightsDesc',
    dataSource: 'night_lights',
    svsId: 5313,
    defaultVolume: 0.45,
    defaultEnabled: false,
    color: '#f39c12',
    mapType: 'flat',
    period: { start: '2012-04', end: '2023-12' },
  },
  {
    id: 'temperature',
    nameKey: 'tracks.temperature',
    descriptionKey: 'tracks.temperatureDesc',
    dataSource: 'temperature',
    svsId: 5207,
    defaultVolume: 0.6,
    defaultEnabled: true,
    color: '#e67e22',
    mapType: 'flat',
    period: { start: '1880-01', end: '2024-09' },
  },
  {
    id: 'wildfires',
    nameKey: 'tracks.wildfires',
    descriptionKey: 'tracks.wildfiresDesc',
    dataSource: 'wildfires',
    svsId: 5113,
    defaultVolume: 0.5,
    defaultEnabled: false,
    color: '#e74c3c',
    mapType: 'flat',
    period: { start: '2002-01', end: '2023-12' },
  },
  {
    id: 'antarctica_melt',
    nameKey: 'tracks.antarcticaMelt',
    descriptionKey: 'tracks.antarcticaMeltDesc',
    dataSource: 'antarctica_melt',
    svsId: 5064,
    defaultVolume: 0.4,
    defaultEnabled: false,
    color: '#3498db',
    mapType: 'antarctic',
    period: { start: '2002-04', end: '2023-12' },
  },
  {
    id: 'lightning',
    nameKey: 'tracks.lightning',
    descriptionKey: 'tracks.lightningDesc',
    dataSource: 'lightning',
    svsId: 5011,
    defaultVolume: 0.35,
    defaultEnabled: false,
    color: '#f1c40f',
    mapType: 'globe',
    period: { start: '1995-01', end: '2023-12' },
  },
  {
    id: 'ecosystem',
    nameKey: 'tracks.ecosystem',
    descriptionKey: 'tracks.ecosystemDesc',
    dataSource: 'ecosystem',
    svsId: 5047,
    defaultVolume: 0.4,
    defaultEnabled: false,
    color: '#2ecc71',
    mapType: 'flat',
    period: { start: '2000-01', end: '2023-12' },
  },
  {
    id: 'deforestation',
    nameKey: 'tracks.deforestation',
    descriptionKey: 'tracks.deforestationDesc',
    dataSource: 'deforestation',
    svsId: 4950,
    defaultVolume: 0.45,
    defaultEnabled: false,
    color: '#27ae60',
    mapType: 'globe',
    period: { start: '2001-01', end: '2023-12' },
  },
];

/**
 * Get a track by ID
 */
export function getTrackById(id: string): Track | undefined {
  return tracks.find((t) => t.id === id);
}

/**
 * Default enabled tracks
 */
export const DEFAULT_ENABLED_TRACKS = tracks.filter((t) => t.defaultEnabled).map((t) => t.id);
