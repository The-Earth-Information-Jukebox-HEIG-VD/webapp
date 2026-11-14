import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Globe, { type GlobeMethods } from 'react-globe.gl';
import type { ZoneFeature, ZoneViewType, GridPoint } from '../../types/zones';
import { getZoneFeatures, findZoneFeature } from '../../data/zones';
import { getPointsInFeature, getFeatureCentroid } from '../../utils/geometry';
import './GlobeView.css';

// Default image dimensions for NASA SVS data (typical equirectangular projection)
const DEFAULT_IMAGE_DIMENSIONS = { width: 3600, height: 1800 };

interface GlobeViewProps {
  selectedZone: string | null;
  onZoneSelect: (zoneId: string, points: GridPoint[]) => void;
  zoneViewType: ZoneViewType;
  currentYear?: number;
  anomalyData?: Map<string, number>;
}

/**
 * Convert a hex color to rgba() format for better browser/library support.
 * react-globe.gl doesn't reliably parse 8-digit hex colors.
 * @param hex - Color in #RRGGBB format
 * @param alpha - Opacity from 0 to 1
 * @returns Color in rgba(r, g, b, a) format
 */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Bucket a temperature anomaly into a base color:
 * warm (orange) for positive, cool (blue) for negative.
 */
function anomalyToColor(anomaly: number): string {
  if (anomaly < -0.5) return '#3498db'; // Cool blue
  if (anomaly > 0.5) return '#e67e22'; // Warm orange
  if (anomaly > 0) return '#f39c12'; // Light orange
  if (anomaly < 0) return '#5dade2'; // Light blue
  return '#4a90d9';
}

const VIEWING_KEYS: Record<ZoneViewType, string> = {
  continent: 'zones.viewingContinents',
  country: 'zones.viewingCountries',
  water: 'zones.viewingWater',
};

// Oceans and seas have no anomaly data: a teal cap, distinct from the
// orange/blue land buckets and from the selected-state blue (#1a73e8, 0.8).
const WATER_CAP_COLOR = hexToRgba('#2ec4b6', 0.35);

// Module-level constant accessors: a stable reference avoids react-globe.gl
// re-processing every polygon on each render.
const POLYGON_SIDE_COLOR = () => 'rgba(100, 150, 200, 0.15)';
const POLYGON_STROKE_COLOR = () => 'rgba(255, 255, 255, 0.5)';

/**
 * 3D Globe visualization using react-globe.gl
 *
 * Displays climate zones as interactive polygons on a rotating globe.
 * Supports both continent and country-level selection.
 */
export function GlobeView({
  selectedZone,
  onZoneSelect,
  zoneViewType,
  currentYear,
  anomalyData,
}: GlobeViewProps) {
  const { t } = useTranslation();
  const globeRef = useRef<GlobeMethods>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 400, height: 400 });
  const [isLoaded, setIsLoaded] = useState(false);
  // Note: Hover state is handled internally by react-globe.gl to avoid flickering

  // Update dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        setDimensions({ width, height: Math.min(height, width) });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Set initial globe position
  useEffect(() => {
    if (globeRef.current && isLoaded) {
      globeRef.current.pointOfView({ lat: 20, lng: 0, altitude: 2.5 }, 1000);
    }
  }, [isLoaded]);

  // Get zone features based on view type
  const zoneFeatures = useMemo(() => {
    return getZoneFeatures(zoneViewType);
  }, [zoneViewType]);

  // Polygon objects must keep a STABLE identity across renders: three-globe joins
  // data to meshes by object reference, so new objects mean destroying and
  // re-creating every zone mesh (visible flicker during playback). Only rebuild
  // when the geometry set or the language (labels) changes.
  const polygonData = useMemo(() => {
    return zoneFeatures.map((feature) => {
      // Pre-compute label to avoid callback caching issues in react-globe.gl
      const zoneName = t(feature.properties.nameKey);
      const zoneType = t(`zones.${feature.properties.type}`);
      const label = `<div class="globe-marker-label">
        <strong>${zoneName}</strong>
        <br/><span class="zone-type">${zoneType}</span>
      </div>`;
      return { ...feature, label };
    });
  }, [zoneFeatures, t]);

  // Map each zone to its color bucket. Serialised to a string key so the color
  // accessor below only changes when a zone actually crosses a color threshold,
  // not on every anomaly value update.
  const colorKey = useMemo(() => {
    return zoneFeatures
      .map((feature) => {
        // For countries, fall back to the parent continent's anomaly
        let anomaly = anomalyData?.get(feature.properties.id);
        if (anomaly === undefined && feature.properties.parentId) {
          anomaly = anomalyData?.get(feature.properties.parentId);
        }
        return `${feature.properties.id}=${anomalyToColor(anomaly ?? 0)}`;
      })
      .join('|');
  }, [zoneFeatures, anomalyData]);

  const polygonCapColor = useMemo(() => {
    const colors = new Map(
      colorKey.split('|').map((entry) => entry.split('=') as [string, string])
    );
    return (d: object) => {
      const id = (d as ZoneFeature).properties.id;
      // Hover state is handled by the library internally to avoid flickering.
      // rgba() because react-globe.gl doesn't reliably parse 8-digit hex.
      if (id === selectedZone) return hexToRgba('#1a73e8', 0.8);
      if (zoneViewType === 'water') return WATER_CAP_COLOR;
      return hexToRgba(colors.get(id) ?? '#4a90d9', 0.4);
    };
  }, [colorKey, selectedZone, zoneViewType]);

  const polygonAltitude = useCallback(
    (d: object) => ((d as ZoneFeature).properties.id === selectedZone ? 0.02 : 0.01),
    [selectedZone]
  );

  const handlePolygonClick = useCallback(
    (polygon: object) => {
      const feature = polygon as ZoneFeature;
      const zoneId = feature.properties.id;

      // Calculate grid points within the zone
      const points = getPointsInFeature(feature, DEFAULT_IMAGE_DIMENSIONS);

      onZoneSelect(zoneId, points);

      // Rotate globe to selected zone's centroid
      if (globeRef.current) {
        const centroid = getFeatureCentroid(feature);
        globeRef.current.pointOfView(
          { lat: centroid.lat, lng: centroid.lng, altitude: 2 },
          1000
        );
      }
    },
    [onZoneSelect]
  );

  // Hover is handled internally by react-globe.gl
  // Setting React state on hover causes full polygonData re-computation and flickering
  const handlePolygonHover = useCallback((_polygon: object | null) => {
    // Let react-globe.gl handle hover visuals internally
  }, []);

  const handleGlobeReady = useCallback(() => {
    setIsLoaded(true);
  }, []);

  // Get selected zone name for screen reader
  const selectedZoneName = useMemo(() => {
    if (!selectedZone) return null;
    const feature = findZoneFeature(selectedZone);
    return feature ? t(feature.properties.nameKey) : selectedZone;
  }, [selectedZone, t]);

  return (
    <div
      ref={containerRef}
      className="globe-view"
      role="img"
      aria-label={t('viewMode.globeDescription')}
    >
      {!isLoaded && (
        <div className="globe-loading" aria-hidden="true">
          <div className="globe-skeleton" />
        </div>
      )}

      <Globe
        ref={globeRef}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="rgba(0,0,0,0)"
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
        bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
        // Polygon layer for zones
        polygonsData={polygonData}
        polygonCapColor={polygonCapColor}
        polygonSideColor={POLYGON_SIDE_COLOR}
        polygonStrokeColor={POLYGON_STROKE_COLOR}
        polygonAltitude={polygonAltitude}
        polygonLabel="label"
        onPolygonClick={handlePolygonClick}
        onPolygonHover={handlePolygonHover}
        onGlobeReady={handleGlobeReady}
        atmosphereColor="#3a228a"
        atmosphereAltitude={0.25}
        enablePointerInteraction={true}
      />

      {currentYear && (
        <div className="globe-year-display" aria-live="polite">
          {selectedZoneName && (
            // Hidden from AT: the role="status" region below already announces selection
            <span className="globe-zone-name" aria-hidden="true">
              {selectedZoneName}
            </span>
          )}
          <span className="year-label">{t('dateTime.year')}</span>
          <span className="year-value">{currentYear}</span>
        </div>
      )}

      {/* Zone type indicator */}
      <div className="globe-zone-type" aria-hidden="true">
        <span className="zone-type-label">
          {t(VIEWING_KEYS[zoneViewType])}
        </span>
      </div>

      {/* Screen reader announcement for selected zone */}
      <div className="sr-only" role="status" aria-live="polite">
        {selectedZoneName && t('zones.selected', { zone: selectedZoneName })}
      </div>
    </div>
  );
}

export default GlobeView;
