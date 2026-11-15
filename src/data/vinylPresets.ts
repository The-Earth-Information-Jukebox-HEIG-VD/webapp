import type { LatLng } from '../utils/vinylGeometry';

/** A ready-made record centre for vinyl mode. Names: i18n `vinyl.presets.<id>`. */
export interface VinylPreset {
  id: string;
  center: LatLng;
}

export const VINYL_PRESETS: VinylPreset[] = [
  { id: 'north-pole', center: { lat: 90, lng: 0 } },
  { id: 'south-pole', center: { lat: -90, lng: 0 } },
  { id: 'europe', center: { lat: 50, lng: 10 } },
  { id: 'africa', center: { lat: 2, lng: 20 } },
  { id: 'north-america', center: { lat: 45, lng: -100 } },
  { id: 'south-america', center: { lat: -15, lng: -60 } },
  { id: 'asia', center: { lat: 40, lng: 90 } },
  { id: 'oceania', center: { lat: -25, lng: 135 } },
  { id: 'pacific', center: { lat: 0, lng: -160 } },
  { id: 'atlantic', center: { lat: 15, lng: -35 } },
  { id: 'indian-ocean', center: { lat: -20, lng: 80 } },
];

export const DEFAULT_VINYL_CENTER: LatLng = VINYL_PRESETS[2].center;

/** The preset whose centre matches `c` (within `tolDeg`), or null for a custom position. */
export function presetForCenter(c: LatLng, tolDeg = 0.05): VinylPreset | null {
  return (
    VINYL_PRESETS.find((p) => {
      if (Math.abs(p.center.lat - c.lat) > tolDeg) return false;
      // Longitude does not matter at the poles
      if (Math.abs(p.center.lat) === 90) return true;
      const dLng = Math.abs(((p.center.lng - c.lng + 540) % 360) - 180);
      return dLng <= tolDeg;
    }) ?? null
  );
}
