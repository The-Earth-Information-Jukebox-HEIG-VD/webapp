import i18n from 'i18next';
import type { TFunction } from 'i18next';

/** Backend unit codes -> short visible symbols. */
const UNIT_SYMBOLS: Record<string, string> = {
  degC: '°C',
  degK: 'K',
  K: 'K',
  ppm: 'ppm',
};

/** Backend unit codes -> i18n key (player:units.*) of the spoken name. */
const SPOKEN_KEYS: Record<string, string> = {
  degC: 'degC',
  degK: 'K',
  K: 'K',
  ppm: 'ppm',
};

const MINUS = '−';

/** Units like "presence (0-1)" are fractions: shown as a percentage. */
function isFraction(units: string | null | undefined): boolean {
  return !!units && /\(0-1\)/.test(units);
}

export function formatUnits(units: string | null | undefined): string {
  if (!units) return '';
  if (isFraction(units)) return '%';
  return UNIT_SYMBOLS[units] ?? units;
}

/** Name of the unit as a screen reader should say it ("degrees Celsius"). */
export function speakableUnits(units: string | null | undefined, t: TFunction): string {
  if (!units) return '';
  if (isFraction(units)) return t('player:units.percent');
  const key = SPOKEN_KEYS[units];
  return key ? t(`player:units.${key}`, { defaultValue: formatUnits(units) }) : units;
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
  const digits = fraction || (!anomaly && Math.abs(shown) >= 100) ? 0 : 1;
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
