import i18n from 'i18next';
import type { TFunction } from 'i18next';

/** Backend unit codes -> short visible symbols. */
const UNIT_SYMBOLS: Record<string, string> = {
  degC: '°C',
  'mm/day': 'mm/day',
  degK: 'K',
  K: 'K',
  ppm: 'ppm',
  // Ocean chlorophyll (backend: "mg/m3"; other spellings accepted)
  'mg/m3': 'mg/m³',
  'mg/m^3': 'mg/m³',
  'mg m-3': 'mg/m³',
  // Carbon monoxide total column
  '1e18 molecules/cm2': '×10¹⁸ molec/cm²',
  '10^18 molecules/cm2': '×10¹⁸ molec/cm²',
  'x10^18 molecules/cm2': '×10¹⁸ molec/cm²',
  // Vegetation greenness, a plain index from -0.2 to 1
  'vegetation index (NDVI)': 'NDVI',
};

/** Backend unit codes -> i18n key (player:units.*) of the spoken name. */
const SPOKEN_KEYS: Record<string, string> = {
  degC: 'degC',
  'mm/day': 'mmPerDay',
  degK: 'K',
  K: 'K',
  ppm: 'ppm',
  'mg/m3': 'mgPerM3',
  'mg/m^3': 'mgPerM3',
  'mg m-3': 'mgPerM3',
  'mg/m³': 'mgPerM3',
  '1e18 molecules/cm2': 'coColumn',
  '10^18 molecules/cm2': 'coColumn',
  'x10^18 molecules/cm2': 'coColumn',
  '×10¹⁸ molec/cm²': 'coColumn',
  'vegetation index (NDVI)': 'ndvi',
  NDVI: 'ndvi',
};

const MINUS = '−';

/** Units like "brightness (0-1)" are fractions: shown as a percentage. */
function isFraction(units: string | null | undefined): boolean {
  return !!units && /\(0[-\u2013]1\)/.test(units);
}

/** "degC anomaly": the value is a departure from normal ("+1.2 °C vs normal"). */
export function isAnomalyUnits(units: string | null | undefined): boolean {
  return !!units && /anomaly/i.test(units);
}

/** "degC anomaly" -> "degC" */
function baseUnits(units: string): string {
  return units.replace(/\s*anomaly\s*/i, '').trim();
}

export function formatUnits(units: string | null | undefined): string {
  if (!units) return '';
  if (isFraction(units)) return '%';
  const base = baseUnits(units);
  return UNIT_SYMBOLS[base] ?? base;
}

/** Name of the unit as a screen reader should say it ("degrees Celsius"). */
export function speakableUnits(units: string | null | undefined, t: TFunction): string {
  if (!units) return '';
  if (isFraction(units)) return t('player:units.percent');
  const key = SPOKEN_KEYS[baseUnits(units)];
  return key ? t(`player:units.${key}`, { defaultValue: formatUnits(units) }) : formatUnits(units);
}

export interface ReadingOptions {
  /** Say the unit in words (for screen reader announcements) instead of the symbol */
  speakable?: boolean;
}

/**
 * Human-readable value, formatted for the current language:
 * "+1.2 °C vs normal" for anomalies, "12.3 mm" otherwise.
 * The number is rounded before the sign is chosen, so there is no "+0.0".
 */
export function formatReading(
  value: number,
  units: string | null | undefined,
  anomaly: boolean,
  t: TFunction,
  options: ReadingOptions = {}
): string {
  const lang = i18n.language || 'en';
  const fraction = isFraction(units);
  const shown = fraction ? value * 100 : value;
  // Small absolute values (vegetation index 0-0.9, sea chlorophyll from 0.03 mg/m³)
  // get two decimals, or they would all read "0.0"
  const digits = fraction || (!anomaly && Math.abs(shown) >= 100) ? 0 : !anomaly && Math.abs(shown) < 1 ? 2 : 1;
  const rounded = Number(shown.toFixed(digits));
  const number = new Intl.NumberFormat(lang, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Math.abs(rounded));
  const sign = rounded > 0 && anomaly ? '+' : rounded < 0 ? MINUS : '';
  const unitLabel = options.speakable ? speakableUnits(units, t) : formatUnits(units);
  return t(anomaly ? 'player:announcements.anomalyValue' : 'player:announcements.absoluteValue', {
    value: `${sign}${number}`,
    units: unitLabel,
  }).trim();
}
