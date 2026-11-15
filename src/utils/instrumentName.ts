import type { TFunction } from 'i18next';

/**
 * The backend always names instruments in English (GET /api/instruments), as
 * "<instrument>" or "<instrument> (<playing style>)", e.g. "Upright bass (walking)".
 * Both parts are translated separately (common.json `instruments.names.*` and
 * `instruments.styles.*`), so a new combination of known parts is translated too.
 * Unknown parts are shown in English.
 */

/** "Bass & lead synth" -> "bass_lead_synth" (the i18n key of a name part) */
export function instrumentKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Split "Upright bass (walking)" into ["Upright bass", "walking"] */
export function splitInstrumentName(name: string): [string, string | null] {
  const m = /^(.*\S)\s*\(([^()]+)\)$/.exec(name.trim());
  return m ? [m[1], m[2]] : [name.trim(), null];
}

/** Translated display name of a backend instrument name */
export function translateInstrument(name: string, t: TFunction): string {
  if (!name) return name;
  const [base, style] = splitInstrumentName(name);
  const baseText = t(`instruments.names.${instrumentKey(base)}`, { defaultValue: base }) as string;
  if (!style) return baseText;
  const styleText = t(`instruments.styles.${instrumentKey(style)}`, { defaultValue: style }) as string;
  return `${baseText} (${styleText})`;
}
