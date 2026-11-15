/**
 * Geometry utilities for polygon operations.
 * Uses ray casting algorithm for point-in-polygon testing.
 */

import type { GridPoint, ZoneFeature } from '../types/zones';
import type { ImageDimensions } from './projection';
import { latLngToPixel, pixelToLatLng } from './projection';

/**
 * Ray casting algorithm to determine if a point is inside a polygon.
 * Coordinates are in [lng, lat] format (GeoJSON standard).
 *
 * @param point - [lng, lat] coordinates
 * @param polygon - Array of [lng, lat] coordinate pairs forming the polygon
 * @returns true if point is inside polygon
 */
export function pointInPolygon(
  point: [number, number],
  polygon: number[][]
): boolean {
  const x = point[0];
  const y = point[1];
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Check if a point is inside a MultiPolygon.
 * A MultiPolygon contains multiple polygons, where the point is inside
 * if it's inside any of the outer rings and not inside any holes.
 *
 * @param point - [lng, lat] coordinates
 * @param multiPolygon - Array of polygons (each polygon is an array of rings, each ring is an array of [lng, lat] coordinates)
 * @returns true if point is inside the multipolygon
 */
export function pointInMultiPolygon(
  point: [number, number],
  multiPolygon: number[][][][]
): boolean {
  for (const polygon of multiPolygon) {
    // Cheap reject: skip the O(vertices) ray cast when the point is outside
    // the polygon's bounding box (holes are always inside the outer ring).
    const box = getPolygonBox(polygon);
    if (
      point[0] < box[0] ||
      point[0] > box[1] ||
      point[1] < box[2] ||
      point[1] > box[3]
    ) {
      continue;
    }
    // First ring is the outer boundary
    const outerRing = polygon[0] as number[][];
    if (pointInPolygon(point, outerRing)) {
      // Check if point is in any hole (subsequent rings)
      let inHole = false;
      for (let i = 1; i < polygon.length; i++) {
        if (pointInPolygon(point, polygon[i] as number[][])) {
          inHole = true;
          break;
        }
      }
      if (!inHole) {
        return true;
      }
    }
  }
  return false;
}

/** [minLng, maxLng, minLat, maxLat] of a polygon's outer ring, cached per polygon. */
const polygonBoxCache = new WeakMap<number[][][], [number, number, number, number]>();

function getPolygonBox(polygon: number[][][]): [number, number, number, number] {
  let box = polygonBoxCache.get(polygon);
  if (!box) {
    box = [Infinity, -Infinity, Infinity, -Infinity];
    for (const [lng, lat] of polygon[0] ?? []) {
      if (lng < box[0]) box[0] = lng;
      if (lng > box[1]) box[1] = lng;
      if (lat < box[2]) box[2] = lat;
      if (lat > box[3]) box[3] = lat;
    }
    polygonBoxCache.set(polygon, box);
  }
  return box;
}

/**
 * Get all grid points inside a polygon feature.
 *
 * @param feature - GeoJSON feature with polygon geometry
 * @param dim - Image dimensions for pixel conversion
 * @param step - Pixel step between samples (default 1)
 * @returns Array of grid points inside the polygon
 */
export function getPointsInFeature(
  feature: ZoneFeature,
  dim: ImageDimensions,
  step: number = 5 // Sample every 5 pixels by default for performance
): GridPoint[] {
  const points: GridPoint[] = [];
  const geometry = feature.geometry;

  // Get bounding box for efficient iteration
  const bbox = getFeatureBoundingBox(feature);

  // Convert bounding box to pixel coordinates
  const minPixel = latLngToPixel(bbox.maxLat, bbox.minLng, dim);
  const maxPixel = latLngToPixel(bbox.minLat, bbox.maxLng, dim);

  // Iterate over the bounding box in pixel space
  for (let y = minPixel.y; y <= maxPixel.y; y += step) {
    for (let x = minPixel.x; x <= maxPixel.x; x += step) {
      const { lat, lng } = pixelToLatLng(x, y, dim);
      const point: [number, number] = [lng, lat];

      let isInside = false;

      if (geometry.type === 'Polygon') {
        // Polygon: first ring is outer, rest are holes
        isInside = pointInMultiPolygon(point, [
          geometry.coordinates as number[][][],
        ]);
      } else if (geometry.type === 'MultiPolygon') {
        const coords = geometry.coordinates as number[][][][];
        isInside = pointInMultiPolygon(point, coords);
      }

      if (isInside) {
        points.push({ lat, lng, x, y });
      }
    }
  }

  return points;
}

/**
 * Get the bounding box of a GeoJSON feature.
 */
export function getFeatureBoundingBox(feature: ZoneFeature): {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
} {
  let minLat = 90;
  let maxLat = -90;
  let minLng = 180;
  let maxLng = -180;

  const processCoordinates = (coords: number[]) => {
    const lng = coords[0];
    const lat = coords[1];
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
  };

  const processRing = (ring: number[][]) => {
    ring.forEach(processCoordinates);
  };

  if (feature.geometry.type === 'Polygon') {
    const coords = feature.geometry.coordinates as number[][][];
    coords.forEach(processRing);
  } else if (feature.geometry.type === 'MultiPolygon') {
    const coords = feature.geometry.coordinates as number[][][][];
    coords.forEach((polygon) => polygon.forEach(processRing));
  }

  return { minLat, maxLat, minLng, maxLng };
}

/**
 * Calculate the centroid of a GeoJSON feature (uses `properties.center` when
 * present, otherwise the mean of outer-ring vertices).
 */
export function getFeatureCentroid(feature: ZoneFeature): {
  lat: number;
  lng: number;
} {
  // Prefer the precomputed spherical centre: averaging vertices is wrong for
  // features split at the antimeridian (e.g. the Pacific).
  const center = feature.properties.center;
  if (center) {
    return { lng: center[0], lat: center[1] };
  }

  const points: number[][] = [];

  const collectPoints = (coords: number[][]) => {
    points.push(...coords);
  };

  if (feature.geometry.type === 'Polygon') {
    const coords = feature.geometry.coordinates as number[][][];
    // Use only outer ring for centroid
    collectPoints(coords[0]);
  } else if (feature.geometry.type === 'MultiPolygon') {
    const coords = feature.geometry.coordinates as number[][][][];
    // Use all outer rings for centroid
    coords.forEach((polygon) => collectPoints(polygon[0]));
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

// ── Camera framing ────────────────────────────────────────────────────

const DEG = Math.PI / 180;

/** Vertical field of view of the globe.gl camera (three.js PerspectiveCamera default). */
const CAMERA_FOV_DEG = 50;
export const MIN_VIEW_ALTITUDE = 0.25;
export const MAX_VIEW_ALTITUDE = 2.5;
/** Polygons smaller than this share of the largest one (overseas territories) are not framed. */
const MAIN_BODY_AREA_RATIO = 0.25;

export interface GlobeView {
  lat: number;
  lng: number;
  altitude: number;
}

/** Approximate area of a ring in square degrees, corrected for latitude. */
function ringArea(ring: number[][]): number {
  let sum = 0;
  let latSum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * y2 - x2 * y1;
    latSum += y1;
  }
  return (Math.abs(sum) / 2) * Math.cos((latSum / ring.length) * DEG);
}

/** Outer rings of the feature's main body: the largest polygon and those of comparable size. */
function mainBodyRings(feature: ZoneFeature): number[][][] {
  const rings =
    feature.geometry.type === 'Polygon'
      ? [(feature.geometry.coordinates as number[][][])[0]]
      : (feature.geometry.coordinates as number[][][][]).map((polygon) => polygon[0]);
  const areas = rings.map(ringArea);
  const largest = Math.max(...areas);
  return rings.filter((_, i) => areas[i] >= largest * MAIN_BODY_AREA_RATIO);
}

function toVector(lng: number, lat: number): [number, number, number] {
  const cosLat = Math.cos(lat * DEG);
  return [cosLat * Math.cos(lng * DEG), cosLat * Math.sin(lng * DEG), Math.sin(lat * DEG)];
}

/**
 * Camera position that centers a zone and makes it fill `fill` of the view height.
 *
 * - Center: the precomputed `properties.center` when present, otherwise the
 *   spherical mean of the main body's vertices (safe across the antimeridian;
 *   overseas territories such as French Guiana do not pull it away).
 * - Altitude (globe radii above the surface): from the zone's angular radius θ,
 *   the camera distance d = cos θ + sin θ / tan(fill · fov / 2), clamped.
 */
export function getFeatureView(feature: ZoneFeature, fill = 0.6): GlobeView {
  const vertices = mainBodyRings(feature).flat();
  if (vertices.length === 0) return { lat: 20, lng: 0, altitude: MAX_VIEW_ALTITUDE };

  let lat: number;
  let lng: number;
  const center = feature.properties.center;
  if (center) {
    [lng, lat] = center;
  } else {
    let x = 0;
    let y = 0;
    let z = 0;
    for (const [vLng, vLat] of vertices) {
      const [vx, vy, vz] = toVector(vLng, vLat);
      x += vx;
      y += vy;
      z += vz;
    }
    lng = Math.atan2(y, x) / DEG;
    lat = Math.atan2(z, Math.hypot(x, y)) / DEG;
  }

  // Angular radius: farthest main-body vertex from the center
  const c = toVector(lng, lat);
  let minDot = 1;
  for (const [vLng, vLat] of vertices) {
    const v = toVector(vLng, vLat);
    minDot = Math.min(minDot, c[0] * v[0] + c[1] * v[1] + c[2] * v[2]);
  }
  const theta = Math.min(Math.acos(Math.max(-1, Math.min(1, minDot))), Math.PI / 2);

  const halfAngle = fill * (CAMERA_FOV_DEG / 2) * DEG;
  const distance = Math.cos(theta) + Math.sin(theta) / Math.tan(halfAngle);
  const altitude = Math.min(MAX_VIEW_ALTITUDE, Math.max(MIN_VIEW_ALTITUDE, distance - 1));

  return { lat, lng, altitude };
}
