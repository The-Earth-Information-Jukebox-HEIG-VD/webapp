import { describe, it, expect } from 'vitest';
import i18n from '../i18n';
import { getZoneDisplayName } from './zoneName';

describe('getZoneDisplayName (accessibility: announced zone names)', () => {
  const t = i18n.t.bind(i18n);

  it('translates continents, countries, oceans and seas', () => {
    expect(getZoneDisplayName('europe', t)).toBe('Europe');
    expect(getZoneDisplayName('pacificOcean', t)).toBe('Pacific Ocean');
    expect(getZoneDisplayName('balticSea', t)).toBe('Baltic Sea');
    expect(getZoneDisplayName('france', t)).toBe('France');
  });

  it('never exposes the raw camelCase id for known zones', () => {
    expect(getZoneDisplayName('pacificOcean', t)).not.toMatch(/[a-z][A-Z]/);
  });

  it('falls back to the id for unknown zones', () => {
    expect(getZoneDisplayName('nowhere', t)).toBe('nowhere');
  });
});
