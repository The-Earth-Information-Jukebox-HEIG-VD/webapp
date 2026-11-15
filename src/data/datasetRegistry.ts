/**
 * Datasets of the jukebox-data Docker volume (repository `datasets`).
 *
 * Volume layout: one folder per dataset, one `.npy` per month named
 * `<prefix>_YYYY_MM.npy`, every file a 720 x 1440 grid of 0.25 deg pixels
 * (row 0 = 90N, column 0 = 180W), NaN = no data.
 *
 * The volume has no metadata sidecars, so units, colors and the display range
 * used for dot opacity live here. The display range only scales opacity: the
 * values themselves are shown exactly as stored.
 */

import { firstTrackColor, FALLBACK_TRACK_COLOR } from './trackColors';

export const GRID_ROWS = 720;
export const GRID_COLS = 1440;
export const GRID_RES_DEG = 0.25;

export interface DatasetDisplay {
  /** Value mapped to transparent. */
  min: number;
  /** Value mapped to fully opaque. */
  max: number;
  /** 'abs': opacity from |value| (signed anomalies). */
  mode: 'linear' | 'abs';
}

export interface DatasetInfo {
  id: string;
  /** Folder in the volume. */
  folder: string;
  /** File name prefix: `<prefix>_YYYY_MM.npy`. */
  prefix: string;
  /** i18n key (common namespace) of the dataset name. */
  labelKey: string;
  /**
   * Audio tracks (backend `dataset_id`, see GET /api/instruments) that play this
   * dataset: the globe shows the dataset only while one of them is selected.
   */
  trackIds: string[];
  units: string;
  /** #RRGGBB, from the shared track palette (trackColors.ts). */
  color: string;
  display: DatasetDisplay;
}

/**
 * Known datasets. Display ranges come from the observed value distribution
 * of the files (about the 99.5th percentile), so typical values stay visible.
 */
export const KNOWN_DATASETS: DatasetInfo[] = [
  {
    id: 'temperature_anomaly',
    folder: 'temperature_anomaly_1880_2025',
    prefix: 'temperature_anomaly',
    labelKey: 'globeData.datasets.temperature_anomaly',
    trackIds: ['temperature', 'temperature_anomaly'],
    units: '°C',
    color: firstTrackColor(['temperature', 'temperature_anomaly']),
    display: { min: 0, max: 5, mode: 'abs' },
  },
  {
    id: 'co2',
    folder: 'co2_2002_2022',
    prefix: 'co2',
    labelKey: 'globeData.datasets.co2',
    trackIds: ['co2'],
    units: 'ppm',
    color: firstTrackColor(['co2']),
    display: { min: 370, max: 435, mode: 'linear' },
  },
  {
    id: 'lightning',
    folder: 'lightning_2017_2023',
    prefix: 'lightning',
    labelKey: 'globeData.datasets.lightning',
    trackIds: ['lightning'],
    units: '',
    color: firstTrackColor(['lightning']),
    display: { min: 0, max: 1, mode: 'linear' },
  },
  {
    id: 'rain',
    folder: 'precipitation_rain_2000_2026',
    prefix: 'rain',
    labelKey: 'globeData.datasets.rain',
    trackIds: ['precipitation', 'rain'],
    units: 'mm/h',
    color: firstTrackColor(['precipitation', 'rain']),
    display: { min: 0, max: 0.75, mode: 'linear' },
  },
  {
    id: 'snow',
    folder: 'precipitation_snow_2000_2026',
    prefix: 'snow',
    labelKey: 'globeData.datasets.snow',
    trackIds: ['snowfall', 'snow'],
    units: 'mm/h',
    color: firstTrackColor(['snowfall', 'snow']),
    display: { min: 0, max: 0.1, mode: 'linear' },
  },
  {
    // One map per year (2012-2023); 94% of cells are dark, p99.5 = 0.2
    id: 'nightlights',
    folder: 'nightlights_2012_2023',
    prefix: 'nightlights',
    labelKey: 'globeData.datasets.nightlights',
    trackIds: ['night_lights', 'nightlights'],
    units: '',
    color: firstTrackColor(['night_lights', 'nightlights']),
    display: { min: 0, max: 0.5, mode: 'linear' },
  },
  {
    // Days with a fire per month (2002-07 to 2026-11); 94% of cells are 0, p99.5 = 17
    id: 'fires',
    folder: 'fires_2002_2026',
    prefix: 'fires',
    labelKey: 'globeData.datasets.fires',
    trackIds: ['fires'],
    units: '',
    color: firstTrackColor(['fires']),
    display: { min: 0, max: 17, mode: 'linear' },
  },
];

/**
 * Registry entry for a volume folder. Unknown folders get a fallback color;
 * their display range is filled from the first frame loaded (see volumeData).
 */
export function datasetForFolder(folder: string, prefix: string, _index: number): DatasetInfo {
  const known = KNOWN_DATASETS.find((d) => d.folder === folder || d.prefix === prefix);
  if (known) return { ...known, folder, prefix };
  return {
    id: prefix,
    folder,
    prefix,
    labelKey: prefix,
    trackIds: [prefix],
    units: '',
    color: FALLBACK_TRACK_COLOR,
    display: { min: NaN, max: NaN, mode: 'linear' },
  };
}

/** Opacity (0-1) of a dot for a stored value. NaN -> 0 (hidden). */
export function valueToAlpha(value: number, display: DatasetDisplay): number {
  if (Number.isNaN(value)) return 0;
  const v = display.mode === 'abs' ? Math.abs(value) : value;
  const span = display.max - display.min;
  if (!(span > 0)) return 0;
  return Math.min(1, Math.max(0, (v - display.min) / span));
}

/** True when one of the selected audio tracks plays this dataset. */
export function isDatasetSelected(info: DatasetInfo, enabledTrackIds: ReadonlySet<string>): boolean {
  return info.trackIds.some((id) => enabledTrackIds.has(id));
}
