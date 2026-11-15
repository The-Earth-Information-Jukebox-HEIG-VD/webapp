/**
 * Single source of truth for track / dataset colours. The same colour is used
 * by the track-panel dot, the graph line (SeriesChart) and the globe dots and
 * legend (datasetRegistry).
 *
 * Two palettes, chosen by the surface the colour sits on (data colours are
 * separate from the brand tokens):
 *  - 'dark'  (TRACK_COLORS_DARK): dark page surfaces and the globe / vinyl
 *    stage, which stays dark in the light theme. Globe dots, the globe legend
 *    and the vinyl views always use 'dark'.
 *  - 'light' (TRACK_COLORS_LIGHT): light page surfaces: the track-panel dots
 *    and the graph lines when the light theme is shown (resolvedTheme).
 *
 * Dark palette: found by a maximin search over in-gamut OKLCH candidates inside
 * a semantic hue window per dataset (warm temperature, blue rain, icy snow...),
 * contrast >= 3:1 on every dark background (originally #1a1f2e panel, #1e2433
 * chart, #1a1a1a high-contrast, #000; re-checked on the ocean-blue surfaces
 * #071327 / #0f203e / #112445, see hooks/trackColors.test.ts), then checked with the dataviz
 * skill validator:
 *
 *   node <dataviz>/scripts/validate_palette.js \
 *     "#e78615,#4070bc,#c990fc,#52f0fd,#ffe815,#38b484,#da154c,#f7f4ee" \
 *     --mode dark --surface "#1a1f2e" --pairs all
 *
 * Results (all 28 pairs): every colour >= 3:1 on #1a1f2e and #071327, normal
 * vision >= 16.1 (floor 15). Without sea_ice, protan/deutan DeltaE >= 11.2.
 * Open: sea_ice #f7f4ee (ice white) reads as grey to this validator (chroma
 * 0.009 < 0.10) and is DeltaE 5.8 from snow #52f0fd under protanopia, below
 * the floor of 6; its own CIEDE2000 check passes. A validated alternative is
 * #834bff (protan/deutan >= 10.1, normal >= 15.8).
 *
 * Documented deviation: snow, lightning, co2, temperature, night_lights and sea_ice are
 * lighter than the skill's
 * dark chart lightness band (L <= 0.67) so globe dots stay visible over the
 * dark ocean texture. The validator reports that as a lightness-band FAIL only.
 *
 * Light palette (same hue roles, darker): validated the same way, light mode:
 *
 *   node <dataviz>/scripts/validate_palette.js \
 *     "#7f3901,#2a53e9,#8944a0,#1096b5,#998b01,#027652,#d51952,#8f75f1" \
 *     --mode light --surface "#f6f7fb" --pairs all
 *
 * Results (all 28 pairs, with sea_ice #8f75f1): protan/deutan DeltaE >= 8.5,
 * normal vision >= 15.6,
 * every colour >= 3:1 on #f6f7fb and on #ffffff. Lightning is an olive yellow
 * (#998b01) so it stays close to "yellow" while reaching 3:1 on white; it is
 * the hue nearest the brand label yellow, so selected / active states near
 * track dots never use yellow (see CLAUDE.md, Visual identity).
 *
 * Unknown datasets get a neutral grey (one per palette): a generated extra hue
 * cannot be guaranteed distinct; their name in the legend/panel identifies them.
 */

/** The surface a data colour is drawn on. */
export type TrackSurface = 'dark' | 'light';

/** Presentation colour per track id (backend `dataset_id`) on dark surfaces. */
export const TRACK_COLORS_DARK: Record<string, string> = {
  temperature: '#e78615',
  precipitation: '#4070bc',
  co2: '#c990fc',
  snow: '#52f0fd',
  lightning: '#ffe815',
  night_lights: '#38b484',
  fires: '#da154c',
  // Ice white, slightly warm so it stays apart from the snow cyan under
  // protanopia: CIEDE2000 >= 13.2 to every other colour under protan/deutan/
  // tritan simulation, >= 25 for normal vision, >= 14:1 on the dark backgrounds
  sea_ice: '#f7f4ee',
};

/** Presentation colour per track id on light surfaces (#f6f7fb / #ffffff). */
export const TRACK_COLORS_LIGHT: Record<string, string> = {
  temperature: '#7f3901',
  precipitation: '#2a53e9',
  co2: '#8944a0',
  snow: '#1096b5',
  lightning: '#998b01',
  night_lights: '#027652',
  fires: '#d51952',
  sea_ice: '#8f75f1',
};

/** The dark palette, kept under its original name (globe, vinyl and legacy imports). */
export const TRACK_COLORS = TRACK_COLORS_DARK;

export const FALLBACK_TRACK_COLOR = '#9aa0a6';
export const FALLBACK_TRACK_COLOR_LIGHT = '#5f6368';

function paletteFor(surface: TrackSurface): Record<string, string> {
  return surface === 'light' ? TRACK_COLORS_LIGHT : TRACK_COLORS_DARK;
}

/** Colour of a track id on a surface, neutral grey when unknown. */
export function trackColor(id: string, surface: TrackSurface = 'dark'): string {
  return (
    paletteFor(surface)[id] ??
    (surface === 'light' ? FALLBACK_TRACK_COLOR_LIGHT : FALLBACK_TRACK_COLOR)
  );
}

/** Colour of the first id of the list that has a palette entry, else the fallback. */
export function firstTrackColor(ids: readonly string[], surface: TrackSurface = 'dark'): string {
  const known = ids.find((id) => id in paletteFor(surface));
  return known ? paletteFor(surface)[known] : trackColor('', surface);
}
