/**
 * Vinyl mode geometry: the globe seen from above a centre point, played like a
 * record. A needle starts near the rim of the visible hemisphere and spirals in
 * towards the centre; the point under the needle is what is being "played".
 *
 * Pure maths (no React, no three.js) so it can be unit tested.
 *
 * Conventions
 * - Angular distances and bearings are in degrees on the unit sphere.
 * - Bearing: clockwise from north, as seen from outside the globe (0 = N, 90 = E).
 * - Progress p in [0, 1] runs over the whole side (VINYL_CHUNKS chunks).
 * - Screen angles: clockwise from +x (CSS / canvas convention, y pointing down).
 */

export interface LatLng {
  lat: number;
  lng: number;
}

/** Chunks (30 s each) in one side of the record. */
export const VINYL_CHUNKS = 10;
/** Grooves (full turns) per chunk: 1 turn per 30 s = 2 rpm, a constant spin like a real record. */
export const TURNS_PER_CHUNK = 1;
/** Camera altitude (globe radii above the surface) in vinyl mode: close, the Earth fills the record. */
export const VINYL_ALTITUDE = 1.6;
/** Needle start: angular distance from the centre, kept well inside the visible horizon (67.4° at 1.6). */
export const THETA_MAX_DEG = 60;
/** Needle end: the "label" around the spindle. */
export const THETA_MIN_DEG = 4;
/** Half width the needle reads (backend `radius_deg`): under half the groove pitch of 5.6°. */
export const GROOVE_RADIUS_DEG = 2;
/** Bars (3 s) per chunk: 30 s. */
export const BARS_PER_CHUNK = 10;
/** Points closer than this add nothing: the backend maps are 1° (temperature 2°). */
export const MIN_POINT_SPACING_DEG = 2;
/** -1: bearing under the needle decreases, i.e. the record spins clockwise on screen. */
export const SPIN_DIRECTION = -1;
/** Where the needle tip sits on screen (clockwise from +x): 0 = right of the centre. */
export const NEEDLE_SCREEN_ANGLE_DEG = 0;

/** Latitude limit used for the centre: the bearing formulas break down exactly at the poles. */
const MAX_CENTER_LAT = 89.9;

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export function clampCenter(c: LatLng): LatLng {
  return { lat: Math.max(-MAX_CENTER_LAT, Math.min(MAX_CENTER_LAT, c.lat)), lng: normalizeLng(c.lng) };
}

/** Longitude in (-180, 180]. */
export function normalizeLng(lng: number): number {
  let l = ((((lng + 180) % 360) + 360) % 360) - 180;
  if (l === -180) l = 180;
  return l;
}

/** Normalise an angle to (-180, 180]. */
export function normalizeAngle(deg: number): number {
  let a = ((((deg + 180) % 360) + 360) % 360) - 180;
  if (a === -180) a = 180;
  return a;
}

/** Angular radius of the visible hemisphere for a camera `altitude` globe radii above the surface. */
export function horizonDeg(altitude: number): number {
  return Math.acos(1 / (1 + altitude)) * DEG;
}

/** Point at angular distance `distDeg` along `bearingDeg` from `from` (great circle). */
export function destination(from: LatLng, distDeg: number, bearingDeg: number): LatLng {
  const c = clampCenter(from);
  const phi1 = c.lat * RAD;
  const lambda1 = c.lng * RAD;
  const delta = distDeg * RAD;
  const theta = bearingDeg * RAD;
  const sinPhi2 = Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta);
  const phi2 = Math.asin(Math.max(-1, Math.min(1, sinPhi2)));
  const lambda2 =
    lambda1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
      Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2)
    );
  return { lat: phi2 * DEG, lng: normalizeLng(lambda2 * DEG) };
}

/** Great-circle angular distance between two points, in degrees. */
export function angularDistanceDeg(a: LatLng, b: LatLng): number {
  const phi1 = a.lat * RAD;
  const phi2 = b.lat * RAD;
  const dPhi = phi2 - phi1;
  const dLambda = (b.lng - a.lng) * RAD;
  const h = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h))) * DEG;
}

export interface SpiralOptions {
  thetaMaxDeg?: number;
  thetaMinDeg?: number;
  chunks?: number;
  turnsPerChunk?: number;
}

function resolve(opts: SpiralOptions = {}) {
  return {
    thetaMax: opts.thetaMaxDeg ?? THETA_MAX_DEG,
    thetaMin: opts.thetaMinDeg ?? THETA_MIN_DEG,
    chunks: opts.chunks ?? VINYL_CHUNKS,
    turnsPerChunk: opts.turnsPerChunk ?? TURNS_PER_CHUNK,
  };
}

/**
 * Needle position (relative to the centre) at progress p:
 * angular distance falls linearly from thetaMax to thetaMin; the bearing turns
 * `turnsPerChunk` full turns per chunk, in SPIN_DIRECTION.
 */
export function spiralAt(p: number, opts?: SpiralOptions): { thetaDeg: number; bearingDeg: number } {
  const { thetaMax, thetaMin, chunks, turnsPerChunk } = resolve(opts);
  const q = Math.max(0, Math.min(1, p));
  return {
    thetaDeg: thetaMax - (thetaMax - thetaMin) * q,
    bearingDeg: SPIN_DIRECTION * 360 * turnsPerChunk * chunks * q,
  };
}

/** Geographic point under the needle at progress p. */
export function needlePoint(center: LatLng, p: number, opts?: SpiralOptions): LatLng {
  const { thetaDeg, bearingDeg } = spiralAt(p, opts);
  return destination(center, thetaDeg, bearingDeg);
}

/** Progress range [start, end) covered by chunk k. */
export function chunkProgressRange(k: number, chunks = VINYL_CHUNKS): [number, number] {
  return [k / chunks, (k + 1) / chunks];
}

/** Arc length (degrees on the sphere) of chunk k's groove, approximately. */
function segmentLengthDeg(k: number, opts?: SpiralOptions): number {
  const { turnsPerChunk, chunks } = resolve(opts);
  const [p0, p1] = chunkProgressRange(k, chunks);
  const mid = spiralAt((p0 + p1) / 2, opts).thetaDeg;
  return 360 * turnsPerChunk * Math.sin(mid * RAD);
}

/** The groove of chunk k as a polyline, sampled about every `stepDeg` along the path. */
export function spiralSegment(center: LatLng, k: number, stepDeg = 1, opts?: SpiralOptions): LatLng[] {
  const { chunks } = resolve(opts);
  const [p0, p1] = chunkProgressRange(k, chunks);
  const n = Math.max(8, Math.ceil(segmentLengthDeg(k, opts) / stepDeg));
  const out: LatLng[] = [];
  for (let i = 0; i <= n; i++) out.push(needlePoint(center, p0 + ((p1 - p0) * i) / n, opts));
  return out;
}

/** Closed small circle at angular distance thetaDeg around the centre (a groove ring). */
export function grooveRing(center: LatLng, thetaDeg: number, n = 180): LatLng[] {
  const out: LatLng[] = [];
  for (let i = 0; i <= n; i++) out.push(destination(center, thetaDeg, (360 * i) / n));
  return out;
}

/**
 * The path the needle crosses during chunk k, for POST /api/zones/groove:
 * BARS_PER_CHUNK bars of `pointsPerBar` points each. `pointsPerBar` is the
 * largest of 4, 2, 1 that keeps the points at least MIN_POINT_SPACING_DEG
 * apart (outer grooves: 4, a point per 0.75 s beat; inner ones: fewer).
 * Point i is where the needle is when stop i starts playing.
 */
export function groovePath(
  center: LatLng,
  k: number,
  opts?: SpiralOptions
): { pointsPerBar: 1 | 2 | 4; path: LatLng[] } {
  const { chunks, turnsPerChunk } = resolve(opts);
  // The groove is tightest at its inner end: the spacing rule must hold there
  const innerTheta = spiralAt(chunkProgressRange(k, chunks)[1], opts).thetaDeg;
  const length = 360 * turnsPerChunk * Math.sin(innerTheta * RAD);
  const pointsPerBar =
    ([4, 2, 1] as const).find((n) => length / (BARS_PER_CHUNK * n) >= MIN_POINT_SPACING_DEG) ?? 1;
  const n = BARS_PER_CHUNK * pointsPerBar;
  const [p0, p1] = chunkProgressRange(k, chunks);
  const path: LatLng[] = [];
  for (let i = 0; i < n; i++) path.push(needlePoint(center, p0 + ((p1 - p0) * i) / n, opts));
  return { pointsPerBar, path };
}

/**
 * CSS rotation (degrees, clockwise) that brings `bearingDeg` under the needle.
 * `northScreenAngleDeg` is the screen angle of north at the centre in the
 * unrotated canvas; a point at bearing b then sits at screen angle north + b.
 */
export function rotationForNeedle(
  northScreenAngleDeg: number,
  bearingDeg: number,
  needleScreenAngleDeg = NEEDLE_SCREEN_ANGLE_DEG
): number {
  return normalizeAngle(needleScreenAngleDeg - (northScreenAngleDeg + bearingDeg));
}

export interface HemisphereLabels {
  n: string;
  s: string;
  e: string;
  w: string;
}

const DEFAULT_HEMIS: HemisphereLabels = { n: 'N', s: 'S', e: 'E', w: 'W' };

/** "48.9° N, 2.4° E" in the given locale. */
export function formatLatLng(p: LatLng, locale = 'en', hemis: HemisphereLabels = DEFAULT_HEMIS): string {
  let fmt: Intl.NumberFormat;
  try {
    fmt = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  } catch {
    fmt = new Intl.NumberFormat('en', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }
  const lng = normalizeLng(p.lng);
  return `${fmt.format(Math.abs(p.lat))}° ${p.lat >= 0 ? hemis.n : hemis.s}, ${fmt.format(Math.abs(lng))}° ${
    lng >= 0 ? hemis.e : hemis.w
  }`;
}

/**
 * A few points spread over the disc of `radiusDeg` around `center`: the centre,
 * 6 points at half the radius and 12 on the rim. Time travel sends them as the
 * "zone" the needle reads while the months go by (the backend averages them).
 */
export function discPoints(center: LatLng, radiusDeg = GROOVE_RADIUS_DEG): LatLng[] {
  const c = clampCenter(center);
  const out: LatLng[] = [c];
  for (let i = 0; i < 6; i++) out.push(destination(c, radiusDeg / 2, (360 * i) / 6));
  for (let i = 0; i < 12; i++) out.push(destination(c, radiusDeg, (360 * i) / 12));
  return out;
}
