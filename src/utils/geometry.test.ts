import { describe, it, expect } from 'vitest';
import { getFeatureView, MIN_VIEW_ALTITUDE, MAX_VIEW_ALTITUDE } from './geometry';
import { findZoneFeature } from '../data/zones';

const view = (id: string) => getFeatureView(findZoneFeature(id)!);

describe('getFeatureView', () => {
  it('centers countries crossing the antimeridian on the country', () => {
    expect(Math.abs(view('fiji').lng)).toBeGreaterThan(160);
    const russia = view('russia');
    expect(russia.lng).toBeGreaterThan(70);
    expect(russia.lng).toBeLessThan(120);
    expect(russia.lat).toBeGreaterThan(50);
  });

  it('ignores overseas territories (France without French Guiana)', () => {
    const france = view('france');
    expect(france.lat).toBeGreaterThan(44);
    expect(france.lat).toBeLessThan(49);
    expect(france.lng).toBeGreaterThan(0);
    expect(france.lng).toBeLessThan(5);
  });

  it('zooms closer on smaller zones, within bounds', () => {
    const ch = view('switzerland').altitude;
    const fr = view('france').altitude;
    const ru = view('russia').altitude;
    expect(ch).toBeGreaterThanOrEqual(MIN_VIEW_ALTITUDE);
    expect(ch).toBeLessThanOrEqual(fr);
    expect(fr).toBeLessThan(ru);
    expect(ru).toBeLessThanOrEqual(MAX_VIEW_ALTITUDE);
  });

  it('uses the precomputed center when present', () => {
    const pacific = findZoneFeature('pacificOcean')!;
    const [lng, lat] = pacific.properties.center!;
    expect(getFeatureView(pacific)).toMatchObject({ lng, lat });
  });
});
