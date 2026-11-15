import type { TFunction } from 'i18next';
import { getZoneFeatures } from '../data/zones';
import { pointInMultiPolygon } from './geometry';
import { normalizeLng, type LatLng } from './vinylGeometry';
import type { ZoneFeature } from '../types/zones';

const cache = new Map<string, string | null>();

function contains(feature: ZoneFeature, point: [number, number]): boolean {
  const { type, coordinates } = feature.geometry;
  const multi = (type === 'Polygon' ? [coordinates] : coordinates) as number[][][][];
  return pointInMultiPolygon(point, multi);
}

/**
 * i18n key of the continent, ocean or sea at `p`, or null (memoised per 1° cell).
 * Continents are checked first, then oceans and seas.
 */
export function regionKeyAt(p: LatLng): string | null {
  const lat = Math.round(p.lat);
  const lng = Math.round(normalizeLng(p.lng));
  const key = `${lat}:${lng}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const point: [number, number] = [normalizeLng(p.lng), p.lat];
  const feature =
    getZoneFeatures('continent').find((f) => contains(f, point)) ??
    getZoneFeatures('water').find((f) => contains(f, point));
  const result = feature?.properties.nameKey ?? null;
  cache.set(key, result);
  return result;
}

/** Translated name of the region at `p`, or null when no zone matches. */
export function regionNameAt(p: LatLng, t: TFunction): string | null {
  const key = regionKeyAt(p);
  return key ? (t(key) as string) : null;
}
