/**
 * Single source of truth for track / dataset colours. The same colour is used
 * by the track-panel dot, the graph line (SeriesChart) and the globe dots and
 * legend (datasetRegistry).
 *
 * Palette found by a maximin search over in-gamut OKLCH candidates inside a
 * semantic hue window per dataset (warm temperature, blue rain, icy snow...),
 * contrast >= 3:1 on every dark background (originally #1a1f2e panel, #1e2433
 * chart, #1a1a1a high-contrast, #000; re-checked on the ocean-blue surfaces
 * #071327 / #0f203e / #112445, see hooks/trackColors.test.ts), then checked with the dataviz
 * skill validator:
 *
 *   node <dataviz>/scripts/validate_palette.js \
 *     "#e78615,#4070bc,#c990fc,#52f0fd,#ffe815,#38b484,#da154c" \
 *     --mode dark --surface "#1a1f2e" --pairs all
 *
 * Results (all 21 pairs): protan/deutan DeltaE >= 11.2 (target 8), tritan
 * >= 13.4, normal vision >= 20.9 (floor 15), every colour >= 3:1 on the surface.
 *
 * Documented deviation: snow, lightning, co2, temperature and night_lights are
 * lighter than the skill's
 * dark chart lightness band (L <= 0.67) so globe dots stay visible over the
 * dark ocean texture. The validator reports that as a lightness-band FAIL only.
 *
 * Unknown datasets get a neutral grey: a generated extra hue cannot be
 * guaranteed distinct; their name in the legend/panel identifies them.
 */

/** Presentation colour per track id (backend `dataset_id`). */
export const TRACK_COLORS: Record<string, string> = {
  temperature: '#e78615',
  precipitation: '#4070bc',
  co2: '#c990fc',
  snow: '#52f0fd',
  lightning: '#ffe815',
  night_lights: '#38b484',
  fires: '#da154c',
};

export const FALLBACK_TRACK_COLOR = '#9aa0a6';

/** Colour of a track id, neutral grey when unknown. */
export function trackColor(id: string): string {
  return TRACK_COLORS[id] ?? FALLBACK_TRACK_COLOR;
}

/** Colour of the first id of the list that has a palette entry, else the fallback. */
export function firstTrackColor(ids: readonly string[]): string {
  const known = ids.find((id) => id in TRACK_COLORS);
  return known ? TRACK_COLORS[known] : FALLBACK_TRACK_COLOR;
}
