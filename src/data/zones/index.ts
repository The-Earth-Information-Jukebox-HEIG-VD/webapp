/**
 * Zone data for polygon-based geographic selection
 *
 * GeoJSON data sourced from Natural Earth (public domain)
 * Simplified for web performance
 */

import type { Zone, ZoneFeature, ZoneFeatureCollection, ZoneViewType } from '../../types/zones';
import continentsData from './continents.json';
import countriesData from './countries.json';
import waterData from './water.json';

/**
 * Signed area of a ring in (lng, lat) space, using the shoelace formula.
 *
 * - Positive → counter-clockwise (RFC 7946 outer-ring convention)
 * - Negative → clockwise (d3-geo / react-globe.gl outer-ring convention)
 *
 * Planar area is sufficient to determine orientation as long as rings do not
 * cross the antimeridian, which holds for all zone data in this module.
 */
export function calculateSignedArea(ring: number[][]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length]; // works for closed or unclosed rings
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

/**
 * Orient one polygon's rings for d3-geo: outer ring (index 0) CLOCKWISE,
 * holes (index > 0) COUNTER-CLOCKWISE. Rings are only reversed when their
 * detected winding is wrong.
 */
function orientPolygon(polygon: number[][][]): number[][][] {
  return polygon.map((ring, i) => {
    const area = calculateSignedArea(ring);
    const isOuter = i === 0;
    const needsReverse = isOuter ? area > 0 : area < 0;
    return needsReverse ? [...ring].reverse() : ring;
  });
}

/**
 * Normalize polygon winding order for react-globe.gl compatibility.
 *
 * react-globe.gl uses d3-geo internally, which expects CLOCKWISE outer rings,
 * whereas GeoJSON RFC 7946 specifies COUNTER-CLOCKWISE outer rings. When the
 * winding is wrong, d3-geo fills "the entire world with a small hole".
 *
 * Our source data is NOT consistent (even within a single MultiPolygon, e.g.
 * the USA), so winding is detected per ring rather than assumed per file.
 *
 * @see https://github.com/vasturiano/globe.gl/issues/37
 * @see https://github.com/vasturiano/react-globe.gl/issues/75
 */
export function normalizeWinding(feature: ZoneFeature): ZoneFeature {
  const { geometry } = feature;

  if (geometry.type === 'Polygon') {
    return {
      ...feature,
      geometry: {
        ...geometry,
        coordinates: orientPolygon(geometry.coordinates as number[][][]),
      },
    };
  }

  return {
    ...feature,
    geometry: {
      ...geometry,
      coordinates: (geometry.coordinates as number[][][][]).map(orientPolygon),
    },
  };
}

function normalizeCollection(data: ZoneFeatureCollection): ZoneFeatureCollection {
  return { ...data, features: data.features.map(normalizeWinding) };
}

// Normalized once at module load; every consumer gets d3-geo-ready geometry.
export const continentsGeoJSON = normalizeCollection(
  continentsData as ZoneFeatureCollection
);
export const countriesGeoJSON = normalizeCollection(
  countriesData as ZoneFeatureCollection
);
/**
 * Oceans (type 'ocean') and major seas, bays and gulfs (type 'sea').
 * Seas carry `parentId` = their ocean; inland seas (Caspian) have none.
 * Every feature carries a precomputed spherical `center`.
 */
export const waterGeoJSON = normalizeCollection(
  waterData as ZoneFeatureCollection
);

/**
 * Get all zone features for a given view type.
 */
export function getZoneFeatures(view: ZoneViewType): ZoneFeature[] {
  switch (view) {
    case 'continent':
      return continentsGeoJSON.features;
    case 'country':
      return countriesGeoJSON.features;
    case 'water':
      return waterGeoJSON.features;
  }
}

/**
 * Get the five oceans.
 */
export function getOceans(): ZoneFeature[] {
  return waterGeoJSON.features.filter((f) => f.properties.type === 'ocean');
}

/**
 * Get seas, bays and gulfs belonging to an ocean.
 */
export function getSeasByOcean(oceanId: string): ZoneFeature[] {
  return waterGeoJSON.features.filter(
    (f) => f.properties.type === 'sea' && f.properties.parentId === oceanId
  );
}

/**
 * Get seas not connected to any ocean (e.g. Caspian Sea).
 */
export function getInlandSeas(): ZoneFeature[] {
  return waterGeoJSON.features.filter(
    (f) => f.properties.type === 'sea' && !f.properties.parentId
  );
}

/**
 * Get zone features filtered by parent (continent).
 */
export function getCountriesByContinent(continentId: string): ZoneFeature[] {
  return countriesGeoJSON.features.filter(
    (f) => f.properties.parentId === continentId
  );
}

/**
 * Find a zone feature by ID (continents, then countries, then oceans & seas).
 */
export function findZoneFeature(zoneId: string): ZoneFeature | undefined {
  return (
    continentsGeoJSON.features.find((f) => f.properties.id === zoneId) ??
    countriesGeoJSON.features.find((f) => f.properties.id === zoneId) ??
    waterGeoJSON.features.find((f) => f.properties.id === zoneId)
  );
}

/**
 * Get Zone metadata from a ZoneFeature
 */
export function getZoneFromFeature(feature: ZoneFeature): Zone {
  const { id, name, nameKey, type, parentId } = feature.properties;

  // Calculate centroid and bounding box from geometry
  const bbox = calculateBoundingBox(feature);
  const centroid = calculateCentroid(feature);

  return {
    id,
    name,
    nameKey,
    type,
    parentId,
    centroid,
    boundingBox: bbox,
  };
}

/**
 * Get all zones as Zone objects
 */
export function getAllZones(view: ZoneViewType): Zone[] {
  const features = getZoneFeatures(view);
  return features.map(getZoneFromFeature);
}

/**
 * Calculate bounding box from feature geometry
 */
function calculateBoundingBox(feature: ZoneFeature): {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
} {
  let minLat = 90;
  let maxLat = -90;
  let minLng = 180;
  let maxLng = -180;

  const processCoord = (coord: number[]) => {
    const lng = coord[0];
    const lat = coord[1];
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
  };

  if (feature.geometry.type === 'Polygon') {
    const coords = feature.geometry.coordinates as number[][][];
    coords.forEach((ring) => ring.forEach(processCoord));
  } else if (feature.geometry.type === 'MultiPolygon') {
    const coords = feature.geometry.coordinates as number[][][][];
    coords.forEach((polygon) =>
      polygon.forEach((ring) => ring.forEach(processCoord))
    );
  }

  return { minLat, maxLat, minLng, maxLng };
}

/**
 * Calculate centroid from feature geometry
 */
function calculateCentroid(feature: ZoneFeature): { lat: number; lng: number } {
  if (feature.properties.center) {
    const [lng, lat] = feature.properties.center;
    return { lat, lng };
  }

  const points: number[][] = [];

  if (feature.geometry.type === 'Polygon') {
    const coords = feature.geometry.coordinates as number[][][];
    points.push(...coords[0]);
  } else if (feature.geometry.type === 'MultiPolygon') {
    const coords = feature.geometry.coordinates as number[][][][];
    coords.forEach((polygon) => points.push(...polygon[0]));
  }

  if (points.length === 0) {
    return { lat: 0, lng: 0 };
  }

  let sumLng = 0;
  let sumLat = 0;
  for (const point of points) {
    sumLng += point[0];
    sumLat += point[1];
  }

  return {
    lng: sumLng / points.length,
    lat: sumLat / points.length,
  };
}

/**
 * All continent IDs
 */
export const CONTINENT_IDS = [
  'africa',
  'antarctica',
  'asia',
  'europe',
  'northAmerica',
  'oceania',
  'southAmerica',
] as const;

/**
 * Default zone (Global view - no specific selection)
 */
export const DEFAULT_ZONE_ID = 'europe';
