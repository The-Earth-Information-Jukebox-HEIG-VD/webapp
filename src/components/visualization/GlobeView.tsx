import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Globe, { type GlobeMethods } from 'react-globe.gl';
import type { ZoneFeature, ZoneViewType, GridPoint } from '../../types/zones';
import { getZoneFeatures, findZoneFeature } from '../../data/zones';
import { getPointsInFeature, getFeatureView } from '../../utils/geometry';
import type { ZoneDataFrames } from '../../hooks/useZoneDataFrames';
import { useSpotLayer } from './useSpotLayer';
import type { Track } from '../../types/tracks';
import { prefersReducedMotion } from '../../utils/motion';
import './GlobeView.css';

// Default image dimensions for NASA SVS data (typical equirectangular projection)
const DEFAULT_IMAGE_DIMENSIONS = { width: 3600, height: 1800 };

/** Whole-Earth view shown while no zone is selected. */
const DEFAULT_VIEW = { lat: 20, lng: 0, altitude: 2.5 };

/**
 * Camera flight time (ms) that keeps the apparent speed steady: a hop to a
 * neighbouring country is quick, a flight across the planet with a big zoom
 * change takes longer instead of whipping past at the same 1 s.
 */
export function flightDuration(
  from: { lat?: number; lng?: number; altitude?: number } | undefined,
  to: { lat: number; lng: number; altitude: number }
): number {
  if (from?.lat === undefined || from.lng === undefined || from.altitude === undefined) return 1200;
  const rad = Math.PI / 180;
  const cosAngle =
    Math.sin(from.lat * rad) * Math.sin(to.lat * rad) +
    Math.cos(from.lat * rad) * Math.cos(to.lat * rad) * Math.cos((to.lng - from.lng) * rad);
  const angleDeg = Math.acos(Math.min(1, Math.max(-1, cosAngle))) / rad;
  const zoom = Math.abs(Math.log2((to.altitude + 0.1) / (from.altitude + 0.1)));
  return Math.round(Math.min(2200, Math.max(700, 700 + angleDeg * 6 + zoom * 350)));
}

export type GlobeMode = 'select' | 'playback';

interface GlobeViewProps {
  selectedZone: string | null;
  onZoneSelect: (zoneId: string, points: GridPoint[]) => void;
  zoneViewType: ZoneViewType;
  currentYear?: number;
  /** 'select': zone polygons; 'playback': the zone's data as flowing spots. */
  mode?: GlobeMode;
  /** Volume data of the selected zone (playback mode). */
  zoneData?: ZoneDataFrames;
  onBackToSelection?: () => void;
  /** Audio tracks (GET /api/instruments): name the instrument playing each dataset. */
  tracks?: Track[];
  /** Tracks switched on in the track panel. */
  enabledTrackIds?: Set<string>;
  /** Tracks audible in the current chunk. */
  soundingIds?: Set<string>;
}

/** An enabled audio track playing a dataset of the legend. */
interface LegendInstrument {
  id: string;
  instrument: string;
  sounding: boolean;
}

const NO_TRACKS: Track[] = [];
const NO_IDS = new Set<string>();

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

const VIEWING_KEYS: Record<ZoneViewType, string> = {
  continent: 'zones.viewingContinents',
  country: 'zones.viewingCountries',
  water: 'zones.viewingWater',
};

const ZONE_CAP_COLOR = hexToRgba('#4a90d9', 0.4);
const SELECTED_CAP_COLOR = hexToRgba('#1a73e8', 0.8);
// Oceans and seas: a teal cap, distinct from land zones and from the selected-state blue.
const WATER_CAP_COLOR = hexToRgba('#2ec4b6', 0.35);

// Module-level constant accessors: a stable reference avoids react-globe.gl
// re-processing every polygon on each render.
const POLYGON_SIDE_COLOR = () => 'rgba(100, 150, 200, 0.15)';
const POLYGON_STROKE_COLOR = () => 'rgba(255, 255, 255, 0.5)';
const NO_POLYGONS: object[] = [];

interface DatasetStats {
  min: number;
  max: number;
  mean: number;
  count: number;
}

function statsOf(values: Float32Array | null | undefined): DatasetStats | null {
  if (!values) return null;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let count = 0;
  for (const v of values) {
    if (Number.isNaN(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    count++;
  }
  return count ? { min, max, mean: sum / count, count } : null;
}

function formatValue(v: number): string {
  const a = Math.abs(v);
  if (a !== 0 && a < 0.01) return v.toExponential(1);
  return v.toFixed(a >= 100 ? 1 : 2);
}


/**
 * 3D Globe visualization using react-globe.gl
 *
 * Select mode: climate zones as interactive polygons.
 * Playback mode: the zone polygons are removed and the stored values of every
 * dataset of the data volume are drawn as flowing spots (one color per dataset,
 * size from the value, no spot where there is nothing), growing and shrinking
 * as the music plays (useSpotLayer / flowSpots.ts).
 */
export function GlobeView({
  selectedZone,
  onZoneSelect,
  zoneViewType,
  currentYear,
  mode = 'select',
  zoneData,
  onBackToSelection,
  tracks = NO_TRACKS,
  enabledTrackIds = NO_IDS,
  soundingIds = NO_IDS,
}: GlobeViewProps) {
  const { t, i18n } = useTranslation();
  const globeRef = useRef<GlobeMethods>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 400, height: 400 });
  const [isLoaded, setIsLoaded] = useState(false);
  const isPlayback = mode === 'playback';
  // Note: Hover state is handled internally by react-globe.gl to avoid flickering

  // Update dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        // Fill the whole box: a square canvas left bands above/below in tall boxes
        setDimensions({ width, height });
      }
    };

    updateDimensions();
    // The container follows the track panel's height (App.css), which changes
    // without a window resize (tracks loading, errors): observe the box itself
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      const observer = new ResizeObserver(updateDimensions);
      observer.observe(containerRef.current);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // The only place the camera is moved: frame the selected zone (or show the
  // default view). Keyed on the zone only, so starting/pausing playback, seeking
  // or toggling tracks never resets the view (nor the user's own zoom).
  useEffect(() => {
    if (!globeRef.current || !isLoaded) return;
    const feature = selectedZone ? findZoneFeature(selectedZone) : undefined;
    const target = feature ? getFeatureView(feature) : DEFAULT_VIEW;
    const current = globeRef.current.pointOfView() as Partial<typeof DEFAULT_VIEW> | undefined;
    globeRef.current.pointOfView(target, prefersReducedMotion() ? 0 : flightDuration(current, target));
  }, [isLoaded, selectedZone]);

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

  const polygonCapColor = useMemo(() => {
    return (d: object) => {
      const id = (d as ZoneFeature).properties.id;
      // Hover state is handled by the library internally to avoid flickering.
      // rgba() because react-globe.gl doesn't reliably parse 8-digit hex.
      if (id === selectedZone) return SELECTED_CAP_COLOR;
      if (zoneViewType === 'water') return WATER_CAP_COLOR;
      return ZONE_CAP_COLOR;
    };
  }, [selectedZone, zoneViewType]);

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

      // The camera follows selectedZone (see the framing effect above)
      onZoneSelect(zoneId, points);
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

  // ── Playback: flowing spots ─────────────────────────────────────────
  const grid = isPlayback ? zoneData?.grid ?? null : null;
  const datasets = useMemo(() => zoneData?.datasets ?? [], [zoneData?.datasets]);
  const frame = isPlayback ? zoneData?.frame ?? null : null;

  useSpotLayer(globeRef, isLoaded, grid, datasets, frame);

  // Per dataset, the stored values of this month in the zone (shown in the legend and table)
  const stats = useMemo(
    () =>
      datasets.map((ds) => ({
        ds,
        stats: frame ? statsOf(frame.get(ds.info.id)) : null,
        // Track just switched on: its first month is still downloading
        pending: !frame || !frame.has(ds.info.id),
        // Instruments of the enabled tracks playing this dataset (one line per instrument)
        instruments: ds.info.trackIds.reduce<LegendInstrument[]>((list, id) => {
          const track = tracks.find((tr) => tr.id === id);
          if (!track?.instrument || !enabledTrackIds.has(id)) return list;
          const sounding = soundingIds.has(id);
          const same = list.find((i) => i.instrument === track.instrument);
          if (same) same.sounding ||= sounding;
          else list.push({ id, instrument: track.instrument, sounding });
          return list;
        }, []),
      })),
    [datasets, frame, tracks, enabledTrackIds, soundingIds]
  );

  const monthLabel = useMemo(() => {
    if (!zoneData?.month) return null;
    const [y, m] = zoneData.month.split('_').map(Number);
    return new Intl.DateTimeFormat(i18n.language, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
      new Date(Date.UTC(y, m - 1, 1))
    );
  }, [zoneData?.month, i18n.language]);

  // Escape returns to zone selection (unless a dialog is open)
  useEffect(() => {
    if (!isPlayback || !onBackToSelection) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('[aria-modal="true"]')) return;
      onBackToSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isPlayback, onBackToSelection]);

  const status = isPlayback ? zoneData?.status ?? 'loading' : 'idle';
  let dataStatusText = '';
  if (status === 'loading') dataStatusText = t('globeData.loading', { zone: selectedZoneName ?? '' });
  else if (status === 'ready')
    dataStatusText = t('globeData.showing', {
      count: stats.filter((s) => s.stats).length,
      zone: selectedZoneName ?? '',
    });

  return (
    <div ref={containerRef} className="globe-view">
      {!isLoaded && (
        <div className="globe-loading" aria-hidden="true">
          <div className="globe-skeleton" />
        </div>
      )}

      {/* role="img" only on the canvas: it would hide the overlay controls from AT */}
      <div className={isLoaded ? 'globe-canvas is-loaded' : 'globe-canvas'} role="img" aria-label={t('viewMode.globeDescription')}>
        <Globe
          ref={globeRef}
          width={dimensions.width}
          height={dimensions.height}
          backgroundColor="rgba(0,0,0,0)"
          globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
          bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
          // Polygon layer for zone selection (removed during playback)
          polygonsData={isPlayback ? NO_POLYGONS : polygonData}
          polygonCapColor={polygonCapColor}
          polygonSideColor={POLYGON_SIDE_COLOR}
          polygonStrokeColor={POLYGON_STROKE_COLOR}
          polygonAltitude={polygonAltitude}
          polygonLabel="label"
          onPolygonClick={handlePolygonClick}
          onPolygonHover={handlePolygonHover}
          // Playback data: drawn by useSpotLayer on its own skin over the globe
          onGlobeReady={handleGlobeReady}
          atmosphereColor="#3a228a"
          atmosphereAltitude={0.25}
          enablePointerInteraction={true}
        />
      </div>

      {currentYear && (
        <div className="globe-year-display">
          {selectedZoneName && (
            // Hidden from AT: the role="status" region below already announces selection
            <span className="globe-zone-name" aria-hidden="true">
              {selectedZoneName}
            </span>
          )}
          <span className="year-label" aria-hidden="true">{t('dateTime.year')}</span>
          {/* Announced once per year; the month below is visual only (it changes too often) */}
          <span className="year-value" aria-live="polite">{currentYear}</span>
          {isPlayback && monthLabel && (
            <span className="globe-month" aria-hidden="true">{monthLabel}</span>
          )}
        </div>
      )}

      {isPlayback ? (
        <div className="globe-data-panel">
          <button type="button" className="globe-back-button" onClick={onBackToSelection}>
            <span aria-hidden="true">←</span> {t('globeData.changeZone')}
            <span className="sr-only"> ({t('globeData.changeZoneHint')})</span>
          </button>

          <section className="globe-legend" aria-label={t('globeData.legendTitle')}>
            <h3 className="globe-legend-title">{t('globeData.legendTitle')}</h3>
            {stats.length === 0 && status === 'ready' && (
              <p className="globe-data-status">{t('globeData.noSelectedDataset')}</p>
            )}
            <ul>
              {stats.map(({ ds, stats: s, pending, instruments }) => (
                <li key={ds.info.id} className={s ? undefined : 'no-data'}>
                  <span className="globe-legend-swatch" style={{ backgroundColor: ds.info.color }} aria-hidden="true" />
                  <span className="globe-legend-name">{t(ds.info.labelKey)}</span>
                  {instruments.map((ins) => (
                    <span key={ins.id} className="globe-legend-instrument" data-sounding={ins.sounding || undefined}>
                      <span aria-hidden="true">♪ {ins.instrument}</span>
                      <span className="sr-only">
                        {t('globeData.playedBy', { instrument: ins.instrument })}
                        {ins.sounding && ` (${t('tracks.sounding')})`}
                      </span>
                      {ins.sounding && (
                        <span className="sounding-bars" data-testid="legend-sounding" aria-hidden="true">
                          <i /><i /><i />
                        </span>
                      )}
                    </span>
                  ))}
                  <span className="globe-legend-range">
                    {s
                      ? t('globeData.range', {
                          min: formatValue(s.min),
                          max: formatValue(s.max),
                          units: ds.info.units,
                        })
                      : pending
                        ? t('globeData.loadingShort')
                        : t('globeData.noDataForMonth')}
                  </span>
                </li>
              ))}
            </ul>
            {status === 'loading' && <p className="globe-data-status">{t('globeData.loadingShort')}</p>}
            {status === 'error' && (
              <p className="globe-data-error" role="alert">
                {t('globeData.error', { message: zoneData?.error ?? '' })}
              </p>
            )}
          </section>
        </div>
      ) : (
        /* Zone type indicator */
        <div className="globe-zone-type" aria-hidden="true">
          <span className="zone-type-label">{t(VIEWING_KEYS[zoneViewType])}</span>
        </div>
      )}

      {/* Data table alternative to the spots (screen readers) */}
      {isPlayback && monthLabel && (
        <table className="sr-only">
          <caption>{t('globeData.tableCaption', { zone: selectedZoneName ?? '', month: monthLabel })}</caption>
          <thead>
            <tr>
              <th scope="col">{t('globeData.dataset')}</th>
              <th scope="col">{t('globeData.instrument')}</th>
              <th scope="col">{t('globeData.min')}</th>
              <th scope="col">{t('globeData.mean')}</th>
              <th scope="col">{t('globeData.max')}</th>
              <th scope="col">{t('globeData.units')}</th>
            </tr>
          </thead>
          <tbody>
            {stats.map(({ ds, stats: s, instruments }) => (
              <tr key={ds.info.id}>
                <th scope="row">{t(ds.info.labelKey)}</th>
                <td>{instruments.map((i) => i.instrument).join(', ')}</td>
                {s ? (
                  <>
                    <td>{formatValue(s.min)}</td>
                    <td>{formatValue(s.mean)}</td>
                    <td>{formatValue(s.max)}</td>
                  </>
                ) : (
                  <td colSpan={3}>{t('globeData.noDataForMonth')}</td>
                )}
                <td>{ds.info.units}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Screen reader announcements: selected zone, then data loading state */}
      <div className="sr-only" role="status" aria-live="polite">
        {isPlayback ? dataStatusText : selectedZoneName && t('zones.selected', { zone: selectedZoneName })}
      </div>
    </div>
  );
}

export default GlobeView;
