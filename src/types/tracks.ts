/**
 * A track the user can switch on or off. Built at runtime from the backend's
 * GET /api/instruments (see hooks/useInstruments.ts); nothing is hardcoded here
 * except presentation details (colours, i18n keys).
 */
export interface Track {
  /** dataset_id accepted by POST /api/sonify */
  id: string;
  /** i18n key of the translated name (falls back to `label`) */
  nameKey: string;
  /** Backend label, used when no translation exists */
  label: string;
  /** Instrument name from the backend, e.g. "Piano (chords)" */
  instrument: string;
  role: string;
  /** false: the server has no data for this variable */
  available: boolean;
  /** true: observed data, false: modelled */
  realData: boolean;
  /** false: only audible while the phenomenon is present */
  alwaysPlaying: boolean;
  units: string | null;
  /** Data period as ISO strings, or null when unknown */
  period: { start: string; end: string } | null;
  color: string;
  defaultEnabled: boolean;
}

/**
 * Enabled/disabled state of a track
 */
export interface TrackState {
  id: string;
  enabled: boolean;
}
