import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import Globe, { type GlobeMethods } from 'react-globe.gl';
import { Raycaster, Sphere, Vector2, Vector3 } from 'three';
import type { Track } from '../../types/tracks';
import { periodAt, type VinylChunkMeta, type VinylTravel } from '../../services/vinylApi';
import { periodToYear } from '../../services/sonificationApi';
import { formatMonthYear } from '../../utils/formatDate';
import {
  NEEDLE_SCREEN_ANGLE_DEG,
  THETA_MAX_DEG,
  THETA_MIN_DEG,
  VINYL_ALTITUDE,
  VINYL_CHUNKS,
  clampCenter,
  destination,
  formatLatLng,
  grooveRing,
  needlePoint,
  normalizeAngle,
  rotationForNeedle,
  spiralAt,
  spiralSegment,
  type LatLng,
} from '../../utils/vinylGeometry';
import { regionNameAt } from '../../utils/regionName';
import { flightDuration } from './GlobeView';
import { VinylChunkTable } from './VinylChunkTable';
import { useHemisphereLabels } from './useHemisphereLabels';
import { timeSpot, trailLayers, trailSpots, type TrailSpots } from './vinylTrail';
import { useTrailSpotLayer } from './useTrailSpotLayer';
import './VinylGlobeView.css';

interface VinylGlobeViewProps {
  center: LatLng;
  onCenterPick: (c: LatLng) => void;
  /** Localised month played, e.g. "March 2020" */
  monthLabel: string;
  /** Groove under the needle (0-based) */
  chunkIndex: number;
  /** Something has been played since the last reset (else the needle rests on the rim) */
  started: boolean;
  isPlaying: boolean;
  /** Progress 0..1 right now (called once per animation frame) */
  getLiveProgress: () => number;
  history: Record<number, VinylChunkMeta>;
  /** Enabled tracks: data dots and table columns */
  tracks: Track[];
  /** No continuous spin: the record moves once per groove */
  reducedMotion: boolean;
  /** What the needle travels through (default 'space'); in 'time' it stays on the centre */
  travel?: VinylTravel;
}

const NO_SPOTS: TrailSpots[] = [];

interface PathDatum {
  id: string;
  points: LatLng[];
  color: string;
  stroke: number;
}

interface Dot {
  id: string;
  lat: number;
  lng: number;
  color: string;
  radius: number;
}

const GROOVE_COLOR = 'rgba(255, 255, 255, 0.28)';
const ACTIVE_COLOR = '#ffffff';
const RAD = Math.PI / 180;
/** How often the data trail checks whether the needle reached the next stop */
const TRAIL_TICK_MS = 200;

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** Stops of the current groove the needle has reached at progress p (at least the first). */
function reachedStops(meta: VinylChunkMeta | undefined, p: number, k: number): number {
  if (!meta || meta.stops.length === 0) return 0;
  const elapsed = Math.max(0, (p * VINYL_CHUNKS - k) * 30);
  return Math.min(meta.stops.length, Math.floor(elapsed / meta.stopSeconds) + 1);
}

/**
 * The globe as a record. The camera looks straight down at the centre; the
 * whole canvas is rotated (CSS) so the groove being played passes under a
 * fixed tonearm, like a turntable. Rolling the camera about its view axis and
 * rotating the image about the canvas centre are the same thing, so this is
 * exact; screen positions come from the globe itself (getScreenCoords).
 * Behind the needle, the values read at each stop stay on the globe as dots.
 */
export function VinylGlobeView({
  center,
  onCenterPick,
  monthLabel,
  chunkIndex,
  started,
  isPlaying,
  getLiveProgress,
  history,
  tracks,
  reducedMotion,
  travel = 'space',
}: VinylGlobeViewProps) {
  const { t, i18n } = useTranslation();
  const hemis = useHemisphereLabels();
  const containerRef = useRef<HTMLDivElement>(null);
  const spinRef = useRef<HTMLDivElement>(null);
  const armRef = useRef<SVGLineElement>(null);
  const headRef = useRef<SVGRectElement>(null);
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  /** What is on screen now (the click is undone with this, not with the target) */
  const shown = useRef({ rot: 0, tip: 0 });
  /** Smooth turn to a new centre: from what was shown, eased over the camera flight */
  const tween = useRef<{ rot: number; tip: number; start: number; dur: number } | null>(null);
  const [size, setSize] = useState(400);
  const [isLoaded, setIsLoaded] = useState(false);
  const [flying, setFlying] = useState(false);

  const c = useMemo(() => clampCenter(center), [center]);

  // Square canvas: the rotated corners never show
  useEffect(() => {
    const update = () => {
      const el = containerRef.current;
      if (!el) return;
      const s = Math.max(240, Math.floor(Math.min(el.clientWidth, el.clientHeight || el.clientWidth)));
      setSize(s);
    };
    update();
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      const observer = new ResizeObserver(update);
      observer.observe(containerRef.current);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Look straight down at the record centre; the record is not dragged or zoomed.
  // A new centre: the record turns smoothly to its new angle during the flight.
  const firstView = useRef(true);
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !isLoaded) return;
    const controls = g.controls?.();
    if (controls) controls.enabled = false;
    const target = { lat: c.lat, lng: c.lng, altitude: VINYL_ALTITUDE };
    const current = g.pointOfView() as Partial<typeof target> | undefined;
    const dur = reducedMotion || firstView.current ? 0 : flightDuration(current, target);
    firstView.current = false;
    g.pointOfView(target, dur);
    if (dur === 0) {
      tween.current = null;
      return;
    }
    tween.current = { ...shown.current, start: performance.now(), dur };
    setFlying(true);
    const timer = window.setTimeout(() => setFlying(false), dur + 100);
    return () => window.clearTimeout(timer);
  }, [isLoaded, c, reducedMotion]);

  /** Rotate the record and move the tonearm for progress p. */
  const draw = useCallback(
    (p: number) => {
      const g = globeRef.current;
      const spin = spinRef.current;
      if (!g || !spin || !isLoaded) return;
      const c0 = g.getScreenCoords(c.lat, c.lng);
      const north = destination(c, 5, 0);
      const n0 = g.getScreenCoords(north.lat, north.lng);
      if (!c0 || !n0) return;
      const northAngle = Math.atan2(n0.y - c0.y, n0.x - c0.x) / RAD;
      const { thetaDeg, bearingDeg } = spiralAt(p);
      const targetRot = rotationForNeedle(northAngle, bearingDeg);
      // Needle tip: same distance from the centre as the played point, on the fixed needle ray
      const needle = destination(c, thetaDeg, bearingDeg);
      const s0 = g.getScreenCoords(needle.lat, needle.lng);
      const targetTip = s0 ? Math.hypot(s0.x - c0.x, s0.y - c0.y) : 0;

      let rot = targetRot;
      let tip = targetTip;
      const tw = tween.current;
      if (tw) {
        const k = Math.min(1, (performance.now() - tw.start) / tw.dur);
        const e = easeInOut(k);
        rot = tw.rot + normalizeAngle(targetRot - tw.rot) * e;
        tip = tw.tip + (targetTip - tw.tip) * e;
        if (k >= 1) tween.current = null;
      }
      shown.current = { rot, tip };
      spin.style.transform = `rotate(${rot}deg)`;

      const tipX = size / 2 + tip * Math.cos(NEEDLE_SCREEN_ANGLE_DEG * RAD);
      const tipY = size / 2 + tip * Math.sin(NEEDLE_SCREEN_ANGLE_DEG * RAD);
      armRef.current?.setAttribute('x2', String(tipX));
      armRef.current?.setAttribute('y2', String(tipY));
      headRef.current?.setAttribute('transform', `translate(${tipX} ${tipY}) rotate(45)`);
    },
    [c, isLoaded, size]
  );

  // Where the needle rests when the record does not spin continuously
  const stillProgress = useCallback(
    () => (!started ? 0 : reducedMotion ? (chunkIndex + 0.5) / VINYL_CHUNKS : getLiveProgress()),
    [started, reducedMotion, chunkIndex, getLiveProgress]
  );

  // Playing with motion, or turning to a new centre: draw every frame
  const spinning = isPlaying && !reducedMotion;
  const animate = spinning || flying;
  useEffect(() => {
    if (!animate) return;
    let raf = 0;
    const loop = () => {
      draw(spinning ? getLiveProgress() : stillProgress());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [animate, spinning, draw, getLiveProgress, stillProgress]);

  // Paused, idle or reduced motion: one still frame (per groove when reduced)
  useEffect(() => {
    if (animate) return;
    draw(stillProgress());
  }, [animate, draw, stillProgress]);

  // ---- Data trail: stops the needle has passed ----------------------------
  const timeTravel = travel === 'time';
  const [reached, setReached] = useState(0);
  // Real date under the needle when the date moves (time and both travel)
  const [dateLabel, setDateLabel] = useState<string | null>(null);
  useEffect(() => {
    const update = () => {
      const p = getLiveProgress();
      setReached(started ? reachedStops(history[chunkIndex], p, chunkIndex) : 0);
      const meta = history[chunkIndex];
      setDateLabel(
        started && travel !== 'space' && meta
          ? formatMonthYear(
              periodToYear(periodAt(meta, Math.max(0, (p * VINYL_CHUNKS - chunkIndex) * 30))),
              i18n.language
            )
          : null
      );
    };
    update();
    if (!isPlaying) return;
    const id = window.setInterval(update, TRAIL_TICK_MS);
    return () => window.clearInterval(id);
  }, [isPlaying, started, history, chunkIndex, getLiveProgress, travel, i18n.language]);

  // The trail is drawn like zone mode's flowing spots, by the GPU (useTrailSpotLayer)
  const layers = useMemo(() => trailLayers(tracks), [tracks]);
  // Time travel: the needle does not move over the ground, so there is no trail
  const spots = useMemo(
    () => (timeTravel ? NO_SPOTS : trailSpots(started ? history : {}, chunkIndex, reached, layers)),
    [timeTravel, started, history, chunkIndex, reached, layers]
  );
  useTrailSpotLayer(globeRef, isLoaded, layers, spots);

  // Grooves: faint rings, the groove being played highlighted
  const paths = useMemo<PathDatum[]>(() => {
    const rings: PathDatum[] = [];
    for (let i = 0; i <= VINYL_CHUNKS; i++) {
      const theta = THETA_MAX_DEG - ((THETA_MAX_DEG - THETA_MIN_DEG) * i) / VINYL_CHUNKS;
      rings.push({ id: `ring-${i}`, points: grooveRing(c, theta, 120), color: GROOVE_COLOR, stroke: 0.2 });
    }
    if (started) {
      rings.push({ id: `groove-${chunkIndex}`, points: spiralSegment(c, chunkIndex, 2), color: ACTIVE_COLOR, stroke: 0.6 });
    }
    return rings;
  }, [c, chunkIndex, started]);

  // Centre spindle and (reduced motion) the point being played
  const markers = useMemo<Dot[]>(() => {
    const list: Dot[] = [{ id: 'center', lat: c.lat, lng: c.lng, color: '#ffffff', radius: 0.6 }];
    if (timeTravel) {
      // One spot on the centre, coloured by what the groove reads there
      const spot = started ? timeSpot(history[chunkIndex]?.values, layers) : null;
      if (spot) list.push({ id: 'time-spot', lat: c.lat, lng: c.lng, color: spot.color, radius: spot.radius });
    } else if (reducedMotion && started) {
      const p = needlePoint(c, (chunkIndex + 0.5) / VINYL_CHUNKS);
      list.push({ id: 'needle', lat: p.lat, lng: p.lng, color: ACTIVE_COLOR, radius: 1.2 });
    }
    return list;
  }, [c, reducedMotion, started, chunkIndex, timeTravel, history, layers]);

  // Click: undo the rotation shown on screen, then cast a ray from the camera.
  // (Not toGlobeCoords: it measures the rotated canvas, whose box grows with the angle.)
  const handleClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      const g = globeRef.current;
      if (!g) return;
      const stage = e.currentTarget.getBoundingClientRect();
      const dx = e.clientX - (stage.left + stage.width / 2);
      const dy = e.clientY - (stage.top + stage.height / 2);
      const a = -shown.current.rot * RAD;
      const x = size / 2 + dx * Math.cos(a) - dy * Math.sin(a);
      const y = size / 2 + dx * Math.sin(a) + dy * Math.cos(a);
      const hit = pickGlobe(g, x, y, size);
      if (hit) onCenterPick(hit);
    },
    [onCenterPick, size]
  );

  const fmt = (p: LatLng) => formatLatLng(p, i18n.language, hemis);
  const centreText = fmt(center);
  const needleNow = needlePoint(c, started ? (chunkIndex + 0.5) / VINYL_CHUNKS : 0);
  // In time travel the needle stays on the centre
  const region = regionNameAt(timeTravel ? c : needleNow, t);

  const pivot = { x: size * 0.92, y: size * 0.1 };
  const head = Math.max(4, size * 0.012);

  return (
    <div ref={containerRef} className="vinyl-view" data-theme="dark">
      {!isLoaded && (
        <div className="globe-loading" aria-hidden="true">
          <div className="globe-skeleton" />
        </div>
      )}

      {/* Mouse convenience; the same choice is in the place controls above (keyboard) */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div className="vinyl-stage" style={{ width: size, height: size }} onClick={handleClick}>
        <div
          ref={spinRef}
          className={isLoaded ? 'vinyl-turntable is-loaded' : 'vinyl-turntable'}
          role="img"
          aria-label={t(travel === 'time' ? 'vinyl.recordLabelTime' : 'vinyl.recordLabel', { centre: centreText, month: monthLabel })}
        >
          <Globe
            ref={globeRef}
            width={size}
            height={size}
            backgroundColor="rgba(0,0,0,0)"
            globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
            bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
            pathsData={paths}
            pathPoints="points"
            pathPointLat="lat"
            pathPointLng="lng"
            pathColor="color"
            pathStroke="stroke"
            pathPointAlt={0.004}
            pathTransitionDuration={0}
            pointsData={markers}
            pointLat="lat"
            pointLng="lng"
            pointColor="color"
            pointRadius="radius"
            pointAltitude={0.006}
            pointsMerge={true}
            pointsTransitionDuration={0}
            atmosphereColor="#4a6fc7"
            atmosphereAltitude={0.15}
            enablePointerInteraction={false}
            onGlobeReady={() => setIsLoaded(true)}
          />
        </div>

        {/* Tonearm: fixed, outside the spinning record; the diamond reads the groove */}
        <svg
          className="vinyl-tonearm"
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          aria-hidden="true"
          focusable="false"
        >
          <circle cx={pivot.x} cy={pivot.y} r={size * 0.022} className="vinyl-tonearm-pivot" />
          <line ref={armRef} x1={pivot.x} y1={pivot.y} x2={size * 0.8} y2={size / 2} className="vinyl-tonearm-arm" />
          <rect
            ref={headRef}
            x={-head / 2}
            y={-head / 2}
            width={head}
            height={head}
            transform={`translate(${size * 0.8} ${size / 2}) rotate(45)`}
            className="vinyl-tonearm-head"
          />
        </svg>
      </div>

      <div className="vinyl-caption">
        <span className="vinyl-caption-month">{dateLabel ?? monthLabel}</span>
        <span>{t('vinyl.caption.centre', { centre: centreText })}</span>
        <span>
          {t('vinyl.grooveOf', { k: (started ? chunkIndex : 0) + 1, n: VINYL_CHUNKS })}
          {region && ` · ${t('vinyl.caption.near', { region })}`}
        </span>
      </div>

      <p className="vinyl-pick-hint">{t('vinyl.pickHint')}</p>

      <VinylChunkTable
        center={center}
        monthLabel={monthLabel}
        history={history}
        tracks={tracks}
        currentIndex={started ? chunkIndex : null}
        travel={travel}
      />
    </div>
  );
}

/** Geographic point under canvas pixel (x, y) of a square canvas, or null off the globe. */
export function pickGlobe(g: GlobeMethods, x: number, y: number, size: number): LatLng | null {
  const ndc = new Vector2((x / size) * 2 - 1, -((y / size) * 2 - 1));
  const raycaster = new Raycaster();
  raycaster.setFromCamera(ndc, g.camera());
  const hit = raycaster.ray.intersectSphere(new Sphere(new Vector3(0, 0, 0), g.getGlobeRadius()), new Vector3());
  if (!hit) return null;
  const geo = g.toGeoCoords({ x: hit.x, y: hit.y, z: hit.z });
  return { lat: geo.lat, lng: geo.lng };
}

export default VinylGlobeView;
