/**
 * Equirectangular projection utilities for converting between
 * lat/lng coordinates and pixel coordinates in NASA imagery.
 */

export interface ImageDimensions {
  width: number;
  height: number;
}

/**
 * Convert latitude/longitude to pixel coordinates using equirectangular projection.
 * Assumes standard geographic projection where:
 * - Longitude -180 to 180 maps to x: 0 to width
 * - Latitude 90 to -90 maps to y: 0 to height
 */
export function latLngToPixel(
  lat: number,
  lng: number,
  dim: ImageDimensions
): { x: number; y: number } {
  // Normalize longitude to [-180, 180]
  let normalizedLng = lng;
  while (normalizedLng > 180) normalizedLng -= 360;
  while (normalizedLng < -180) normalizedLng += 360;

  // Clamp latitude to [-90, 90]
  const clampedLat = Math.max(-90, Math.min(90, lat));

  // Convert to pixel coordinates
  const x = Math.round(((normalizedLng + 180) / 360) * dim.width);
  const y = Math.round(((90 - clampedLat) / 180) * dim.height);

  return {
    x: Math.max(0, Math.min(dim.width - 1, x)),
    y: Math.max(0, Math.min(dim.height - 1, y)),
  };
}

/**
 * Convert pixel coordinates to latitude/longitude.
 */
export function pixelToLatLng(
  x: number,
  y: number,
  dim: ImageDimensions
): { lat: number; lng: number } {
  const lng = (x / dim.width) * 360 - 180;
  const lat = 90 - (y / dim.height) * 180;

  return { lat, lng };
}

/**
 * Generate a grid of points within a bounding box at a given resolution.
 * Returns all points that can be used for data extraction.
 */
export function generateGridPoints(
  boundingBox: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  },
  dim: ImageDimensions,
  step: number = 1 // pixel step between samples
): { lat: number; lng: number; x: number; y: number }[] {
  const points: { lat: number; lng: number; x: number; y: number }[] = [];

  const minPixel = latLngToPixel(boundingBox.maxLat, boundingBox.minLng, dim);
  const maxPixel = latLngToPixel(boundingBox.minLat, boundingBox.maxLng, dim);

  for (let y = minPixel.y; y <= maxPixel.y; y += step) {
    for (let x = minPixel.x; x <= maxPixel.x; x += step) {
      const { lat, lng } = pixelToLatLng(x, y, dim);
      points.push({ lat, lng, x, y });
    }
  }

  return points;
}

/**
 * Calculate the bounding box from an array of coordinates.
 */
export function calculateBoundingBox(
  coordinates: number[][]
): {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
} {
  let minLat = 90;
  let maxLat = -90;
  let minLng = 180;
  let maxLng = -180;

  for (const coord of coordinates) {
    const lng = coord[0];
    const lat = coord[1];
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
  }

  return { minLat, maxLat, minLng, maxLng };
}

/**
 * Calculate centroid from an array of coordinates.
 */
export function calculateCentroid(
  coordinates: number[][]
): { lat: number; lng: number } {
  let sumLat = 0;
  let sumLng = 0;

  for (const coord of coordinates) {
    sumLng += coord[0];
    sumLat += coord[1];
  }

  return {
    lat: sumLat / coordinates.length,
    lng: sumLng / coordinates.length,
  };
}
