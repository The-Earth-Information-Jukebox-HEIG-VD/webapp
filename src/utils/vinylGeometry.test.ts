import { describe, it, expect } from 'vitest';
import {
  THETA_MAX_DEG,
  THETA_MIN_DEG,
  VINYL_ALTITUDE,
  VINYL_CHUNKS,
  angularDistanceDeg,
  bandPoints,
  destination,
  formatLatLng,
  groovePath,
  MIN_POINT_SPACING_DEG,
  grooveRing,
  horizonDeg,
  needlePoint,
  normalizeLng,
  rotationForNeedle,
  spiralAt,
  spiralSegment,
} from './vinylGeometry';

const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('vinylGeometry', () => {
  it('destination: zero distance is the start, 90° east from (0,0) is (0,90)', () => {
    const p = destination({ lat: 10, lng: 20 }, 0, 45);
    close(p.lat, 10);
    close(p.lng, 20);
    const q = destination({ lat: 0, lng: 0 }, 90, 90);
    close(q.lat, 0);
    close(q.lng, 90);
  });

  it('needle distance from the centre equals the spiral theta', () => {
    const c = { lat: 48, lng: 2 };
    for (const p of [0, 0.13, 0.5, 0.97, 1]) {
      close(angularDistanceDeg(c, needlePoint(c, p)), spiralAt(p).thetaDeg, 1e-6);
    }
  });

  it('spiral runs from the rim to the label and stays inside the visible horizon', () => {
    expect(spiralAt(0).thetaDeg).toBe(THETA_MAX_DEG);
    expect(spiralAt(1).thetaDeg).toBe(THETA_MIN_DEG);
    expect(THETA_MAX_DEG).toBeLessThan(horizonDeg(VINYL_ALTITUDE));
    close(horizonDeg(3), 75.5225, 1e-3);
    // One turn per chunk, bearing decreasing (record spins clockwise)
    expect(spiralAt(1 / VINYL_CHUNKS).bearingDeg).toBeCloseTo(-360);
  });

  it('works at the poles and across the antimeridian without NaN', () => {
    for (const c of [{ lat: 90, lng: 0 }, { lat: -90, lng: 0 }, { lat: 0, lng: 179 }]) {
      for (let k = 0; k < VINYL_CHUNKS; k++) {
        for (const p of spiralSegment(c, k, 5)) {
          expect(Number.isFinite(p.lat)).toBe(true);
          expect(p.lng).toBeGreaterThan(-180);
          expect(p.lng).toBeLessThanOrEqual(180);
        }
      }
    }
    // North pole: latitude of the needle is 90 - theta
    const p = needlePoint({ lat: 90, lng: 0 }, 0.5);
    close(p.lat, 90 - spiralAt(0.5).thetaDeg, 0.2);
  });

  it('bandPoints stays within the band, is de-duplicated and bounded', () => {
    const c = { lat: 50, lng: 10 };
    const pts = bandPoints(c, 0);
    expect(pts.length).toBeGreaterThan(100);
    expect(pts.length).toBeLessThanOrEqual(2500);
    const keys = new Set(pts.map((p) => `${p.lat.toFixed(4)}:${p.lng.toFixed(4)}`));
    expect(keys.size).toBe(pts.length);
    for (const p of pts) {
      expect(p.lat).toBeGreaterThanOrEqual(-90);
      expect(p.lat).toBeLessThanOrEqual(90);
      const d = angularDistanceDeg(c, p);
      expect(d).toBeLessThanOrEqual(THETA_MAX_DEG + 3.01);
      expect(d).toBeGreaterThanOrEqual(spiralAt(0.1).thetaDeg - 3.01);
    }
    expect(bandPoints(c, 0, { maxPoints: 300 }).length).toBeLessThanOrEqual(300);
  });

  it('grooveRing is a closed circle at constant distance', () => {
    const c = { lat: -20, lng: 80 };
    const ring = grooveRing(c, 30, 36);
    expect(ring).toHaveLength(37);
    for (const p of ring) close(angularDistanceDeg(c, p), 30, 1e-6);
  });

  it('rotationForNeedle puts the bearing on the needle ray', () => {
    // North straight up (-90 on screen), needle at the right (0): bearing 90 (east) needs no rotation
    close(rotationForNeedle(-90, 90, 0), 0);
    // Bearing 0 (north, at -90) must turn 90° clockwise to reach the needle
    close(rotationForNeedle(-90, 0, 0), 90);
    // Decreasing bearing (record playing) -> rotation increases: clockwise spin
    expect(rotationForNeedle(-90, -10, 0)).toBeGreaterThan(rotationForNeedle(-90, 0, 0));
  });

  it('normalizes longitudes and formats coordinates', () => {
    expect(normalizeLng(190)).toBe(-170);
    expect(normalizeLng(-180)).toBe(180);
    expect(formatLatLng({ lat: 48.86, lng: -2.35 })).toBe('48.9° N, 2.4° W');
    expect(formatLatLng({ lat: -33.9, lng: 18.4 }, 'fr', { n: 'N', s: 'S', e: 'E', w: 'O' })).toBe('33,9° S, 18,4° E');
  });

  it('groovePath: whole bars, at most 80 points, points at least 2° apart', () => {
    const c = { lat: 48, lng: 2 };
    expect(groovePath(c, 0).pointsPerBar).toBe(4);
    // Innermost groove: fewer points per bar, so they stay 2° apart
    expect(groovePath(c, VINYL_CHUNKS - 1).pointsPerBar).toBeLessThan(4);
    for (let k = 0; k < VINYL_CHUNKS; k++) {
      const { pointsPerBar, path } = groovePath(c, k);
      expect(path).toHaveLength(10 * pointsPerBar);
      expect(path.length).toBeLessThanOrEqual(80);
      for (let i = 1; i < path.length; i++) {
        expect(angularDistanceDeg(path[i - 1], path[i])).toBeGreaterThanOrEqual(MIN_POINT_SPACING_DEG * 0.95);
      }
    }
    // The needle start stays well inside the visible half of the globe
    expect(THETA_MAX_DEG).toBeLessThan(horizonDeg(VINYL_ALTITUDE) - 5);
  });
});
