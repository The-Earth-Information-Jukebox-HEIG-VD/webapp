import { describe, it, expect } from 'vitest';
import {
  TRACK_COLORS,
  TRACK_COLORS_DARK,
  TRACK_COLORS_LIGHT,
  FALLBACK_TRACK_COLOR,
  FALLBACK_TRACK_COLOR_LIGHT,
  trackColor,
  firstTrackColor,
  canonicalTrackId,
  TRACK_ID_ALIASES,
} from './trackColors';
import { contrast } from '../test/contrast';
import { KNOWN_DATASETS, datasetForFolder } from './datasetRegistry';

describe('shared track palette', () => {
  it('every known dataset uses the colour of its track', () => {
    for (const ds of KNOWN_DATASETS) {
      const id = ds.trackIds.find((t) => t in TRACK_COLORS);
      expect(id, `${ds.id} has a palette track`).toBeDefined();
      expect(ds.color, ds.id).toBe(TRACK_COLORS[id as string]);
    }
  });

  it('snow resolves to the snow colour, not the fallback', () => {
    const snow = KNOWN_DATASETS.find((d) => d.id === 'snow');
    expect(snow?.color).toBe(TRACK_COLORS.snow);
  });

  it('palette values are unique and distinct from the fallback', () => {
    const values = Object.values(TRACK_COLORS);
    expect(new Set(values).size).toBe(values.length);
    expect(values).not.toContain(FALLBACK_TRACK_COLOR);
  });

  it('unknown ids and folders get the fallback', () => {
    expect(trackColor('nope')).toBe(FALLBACK_TRACK_COLOR);
    expect(datasetForFolder('mystery_folder', 'mystery', 0).color).toBe(FALLBACK_TRACK_COLOR);
  });
});

describe('light and dark palettes', () => {
  it('cover the same datasets', () => {
    expect(Object.keys(TRACK_COLORS_LIGHT).sort()).toEqual(Object.keys(TRACK_COLORS_DARK).sort());
    expect(TRACK_COLORS).toBe(TRACK_COLORS_DARK);
  });

  it('every known dataset has a colour in both palettes', () => {
    for (const ds of KNOWN_DATASETS) {
      const id = ds.trackIds.find((t) => t in TRACK_COLORS_DARK);
      expect(id, `${ds.id} dark`).toBeDefined();
      expect(TRACK_COLORS_LIGHT[id as string], `${ds.id} light`).toBeDefined();
      expect(firstTrackColor(ds.trackIds, 'light')).toBe(TRACK_COLORS_LIGHT[id as string]);
    }
  });

  it('trackColor picks the palette by surface, dark by default', () => {
    expect(trackColor('fires')).toBe(TRACK_COLORS_DARK.fires);
    expect(trackColor('fires', 'dark')).toBe(TRACK_COLORS_DARK.fires);
    expect(trackColor('fires', 'light')).toBe(TRACK_COLORS_LIGHT.fires);
    expect(trackColor('nope', 'light')).toBe(FALLBACK_TRACK_COLOR_LIGHT);
  });

  it('light colours are unique and reach 3:1 on #ffffff and #f6f7fb', () => {
    const values = Object.values(TRACK_COLORS_LIGHT);
    expect(new Set(values).size).toBe(values.length);
    for (const [id, color] of Object.entries(TRACK_COLORS_LIGHT)) {
      for (const bg of ['#ffffff', '#f6f7fb']) {
        expect(contrast(color, bg), `${id} on ${bg}`).toBeGreaterThanOrEqual(3);
      }
    }
    for (const bg of ['#ffffff', '#f6f7fb']) {
      expect(contrast(FALLBACK_TRACK_COLOR_LIGHT, bg)).toBeGreaterThanOrEqual(3);
    }
  });

  it('dark colours reach 3:1 on #1a1f2e', () => {
    for (const [id, color] of Object.entries(TRACK_COLORS_DARK)) {
      expect(contrast(color, '#1a1f2e'), id).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('vegetation, chlorophyll and carbon monoxide', () => {
  const NEW = ['vegetation', 'chlorophyll', 'carbon_monoxide'];

  it('have a colour in both palettes, distinct from every other track', () => {
    for (const palette of [TRACK_COLORS_DARK, TRACK_COLORS_LIGHT]) {
      for (const id of NEW) expect(palette[id], id).toMatch(/^#[0-9a-f]{6}$/);
      const values = Object.values(palette);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it('backend id aliases resolve to the canonical colour', () => {
    expect(canonicalTrackId('ndvi')).toBe('vegetation');
    expect(canonicalTrackId('co')).toBe('carbon_monoxide');
    expect(canonicalTrackId('fires')).toBe('fires');
    for (const [alias, id] of Object.entries(TRACK_ID_ALIASES)) {
      expect(trackColor(alias, 'dark'), alias).toBe(TRACK_COLORS_DARK[id]);
      expect(trackColor(alias, 'light'), alias).toBe(TRACK_COLORS_LIGHT[id]);
      expect(alias in TRACK_COLORS_DARK, `${alias} is not itself a palette id`).toBe(false);
    }
  });

  it('their volume folders map to registry entries with the track colour', () => {
    const cases: [string, string, string][] = [
      ['vegetation_ndvi_2000_2026', 'ndvi', 'vegetation'],
      ['carbon_monoxide_2000_2024', 'co', 'carbon_monoxide'],
      ['chlorophyll_2002_2026', 'chlorophyll', 'chlorophyll'],
    ];
    for (const [folder, prefix, track] of cases) {
      const ds = datasetForFolder(folder, prefix, 0);
      expect(ds.color, folder).toBe(TRACK_COLORS_DARK[track]);
      expect(ds.trackIds, folder).toContain(track);
      expect(ds.display.max, folder).toBeGreaterThan(ds.display.min);
    }
  });

  it('the co prefix does not collide with co2', () => {
    expect(datasetForFolder('co2_2002_2022', 'co2', 0).id).toBe('co2');
    expect(datasetForFolder('carbon_monoxide_2000_2024', 'co', 0).id).toBe('carbon_monoxide');
  });
});
