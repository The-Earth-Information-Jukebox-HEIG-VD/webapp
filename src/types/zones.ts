/**
 * Zone types for polygon-based geographic selection
 */
export type ZoneType = 'continent' | 'country' | 'ocean' | 'sea';

/**
 * Geographic zone definition
 */
export interface Zone {
  id: string;
  name: string;
  nameKey: string;           // i18n key
  type: ZoneType;
  parentId?: string;         // Continent ID for countries
  centroid: { lat: number; lng: number };
  boundingBox: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
}

/**
 * GeoJSON Feature for zone polygon rendering
 */
export interface ZoneFeature {
  type: 'Feature';
  properties: {
    id: string;
    name: string;
    nameKey: string;
    type: ZoneType;
    parentId?: string;
    /** Precomputed [lng, lat] centre (spherical, antimeridian-safe). Optional. */
    center?: [number, number];
  };
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
}

/**
 * GeoJSON FeatureCollection for zones
 */
export interface ZoneFeatureCollection {
  type: 'FeatureCollection';
  features: ZoneFeature[];
}

/**
 * Grid point within a zone for data extraction
 */
export interface GridPoint {
  lat: number;
  lng: number;
  x: number;   // Pixel X in image
  y: number;   // Pixel Y in image
}

/**
 * Zone selection with computed grid points
 */
export interface ZoneSelection {
  zoneId: string;
  zoneName: string;
  zoneType: ZoneType;
  points: GridPoint[];  // ALL points within zone (for backend)
}

/**
 * Available continent IDs
 */
export type ContinentId =
  | 'africa'
  | 'antarctica'
  | 'asia'
  | 'europe'
  | 'northAmerica'
  | 'oceania'
  | 'southAmerica';

/**
 * View type for zone selection: continents, countries, or oceans & seas
 */
export type ZoneViewType = 'continent' | 'country' | 'water';
