/**
 * Datasets of the jukebox-data Docker volume (repository `datasets`).
 *
 * Volume layout: one folder per dataset, one `.npy` per month named
 * `<prefix>_YYYY_MM.npy`, every file a 720 x 1440 grid of 0.25 deg pixels
 * (row 0 = 90N, column 0 = 180W), NaN = no data.
 *
 * The volume has no metadata sidecars, so units, colors and the display range
 * used for the size of the globe spots live here. The display range only
 * scales the spots: the values themselves are shown exactly as stored.
 */

import { firstTrackColor, FALLBACK_TRACK_COLOR } from './trackColors';

export const GRID_ROWS = 720;
export const GRID_COLS = 1440;
export const GRID_RES_DEG = 0.25;

export interface DatasetDisplay {
  /** Value mapped to no spot. */
  min: number;
  /** Value mapped to the biggest spot. */
  max: number;
  /** 'abs': size from |value| (signed anomalies; below zero is drawn as a ring). */
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
    // Share of the cell with lightning; above half is already a storm hot spot
    display: { min: 0, max: 0.5, mode: 'linear' },
  },
  {
    id: 'rain',
    folder: 'precipitation_rain_2000_2026',
    prefix: 'rain',
    labelKey: 'globeData.datasets.rain',
    trackIds: ['precipitation', 'rain'],
    units: 'mm/h',
    color: firstTrackColor(['precipitation', 'rain']),
    // Spot size: 0.5 mm/h (12 mm/day) is already heavy monthly rain
    display: { min: 0, max: 0.5, mode: 'linear' },
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
    // Days of the month with at least one fire detected (0-31)
    id: 'fires',
    folder: 'fires_2002_2026',
    prefix: 'fires',
    labelKey: 'globeData.datasets.fires',
    trackIds: ['fires'],
    units: 'days',
    color: firstTrackColor(['fires']),
    display: { min: 0, max: 20, mode: 'linear' },
  },
  {
    // Share of the sea covered by ice (0-100 %)
    id: 'sea_ice',
    folder: 'sea_ice_1979_2026',
    prefix: 'sea_ice',
    labelKey: 'globeData.datasets.sea_ice',
    trackIds: ['sea_ice'],
    units: '%',
    color: firstTrackColor(['sea_ice']),
    display: { min: 0, max: 100, mode: 'linear' },
  },
  {
    // MODIS Terra NDVI (-0.2..1, ocean = NaN); stored 0-0.99, p99.5 = 0.905
    id: 'vegetation_ndvi',
    folder: 'vegetation_ndvi_2000_2026',
    prefix: 'ndvi',
    labelKey: 'globeData.datasets.vegetation_ndvi',
    trackIds: ['vegetation', 'ndvi', 'vegetation_ndvi'],
    units: 'NDVI',
    color: firstTrackColor(['vegetation']),
    display: { min: 0, max: 0.9, mode: 'linear' },
  },
  {
    // MOPITT total column, x10^18 molecules/cm2: 1.0 floor, median 1.6,
    // p99.5 = 3.3. The range starts near the median so only plumes show.
    id: 'carbon_monoxide',
    folder: 'carbon_monoxide_2000_2024',
    prefix: 'co',
    labelKey: 'globeData.datasets.carbon_monoxide',
    trackIds: ['carbon_monoxide', 'co'],
    units: '×10¹⁸ molec/cm²',
    color: firstTrackColor(['carbon_monoxide']),
    display: { min: 1.5, max: 3.3, mode: 'linear' },
  },
  {
    // MODIS Aqua ocean chlorophyll-a, mg/m3 (land / clouds = NaN). Very skewed
    // (median 0.14, p95 1.2, p99.5 7): spots saturate at 2 so the open ocean
    // still shows, blooms reach the biggest spot.
    id: 'chlorophyll',
    folder: 'chlorophyll_2002_2026',
    prefix: 'chlorophyll',
    labelKey: 'globeData.datasets.chlorophyll',
    trackIds: ['chlorophyll', 'ocean_chlorophyll', 'chlorophyll_a'],
    units: 'mg/m³',
    color: firstTrackColor(['chlorophyll']),
    display: { min: 0, max: 2, mode: 'linear' },
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

/** Share (0-1) of the display range reached by a stored value (spot size). NaN -> 0 (hidden). */
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
