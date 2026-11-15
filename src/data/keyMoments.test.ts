import { describe, it, expect } from 'vitest';
import {
  keyMoments,
  getMomentsForZone,
  encodeMomentStatuses,
  decodeMomentStatus,
} from './keyMoments';
import { findZoneFeature } from './zones';
import { addMonths, periodToYear } from '../services/sonificationApi';

describe('keyMoments', () => {
  it('links every moment to existing zones', () => {
    for (const m of keyMoments) {
      expect(m.zoneIds.length).toBeGreaterThan(0);
      for (const id of m.zoneIds) expect(findZoneFeature(id), `${m.id} -> ${id}`).toBeDefined();
    }
  });

  it('plays one month before and after the event', () => {
    for (const m of keyMoments) {
      expect(m.start).toBe(addMonths(m.peakStart, -1));
      expect(m.end).toBe(addMonths(m.peakEnd, 1));
    }
    const harvey = keyMoments.find((m) => m.id === 'hurricane-harvey-2017')!;
    expect([harvey.start, harvey.end]).toEqual(['2017-07', '2017-09']);
    const blackSummer = keyMoments.find((m) => m.id === 'black-summer-2019')!;
    expect([blackSummer.start, blackSummer.end]).toEqual(['2019-11', '2020-02']);
    const godzilla = keyMoments.find((m) => m.id === 'el-nino-2015')!;
    expect([godzilla.start, godzilla.end]).toEqual(['2015-10', '2016-02']);
  });

  it('has a credited image for every event', () => {
    for (const m of keyMoments) {
      expect(m.image, m.id).toBeTruthy();
      expect(m.credit?.author, m.id).toBeTruthy();
      // Photos come from Wikimedia Commons; the team's own charts have no source page
      if (m.imageKind === 'chart') expect(m.credit?.url, m.id).toBeUndefined();
      else expect(m.credit?.url, m.id).toMatch(/^https:\/\/commons\.wikimedia\.org\/\?curid=\d+$/);
    }
  });

  it('has the two cleaner-air trends as uncropped carbon monoxide charts', () => {
    for (const [id, zone, start, end] of [
      ['cleaner-air-usa', 'usa', '2003-12', '2025-01'],
      ['cleaner-air-europe', 'europe', '2004-12', '2025-01'],
    ]) {
      const m = keyMoments.find((k) => k.id === id)!;
      expect(m.zoneIds).toEqual([zone]);
      expect(m.datasets).toEqual(['carbon_monoxide']);
      expect([m.start, m.end]).toEqual([start, end]);
      expect(m.imageKind).toBe('chart');
      expect(m.credit?.author).toBe('EarthChestra team');
    }
  });

  it('links every moment to the datasets that show it', () => {
    for (const m of keyMoments) expect(m.datasets.length, m.id).toBeGreaterThan(0);
    const datasets = (id: string) => keyMoments.find((m) => m.id === id)!.datasets;
    expect(datasets('el-nino-2015')).toEqual([
      'precipitation',
      'chlorophyll',
      'vegetation',
      'fires',
      'carbon_monoxide',
    ]);
    expect(datasets('black-summer-2019')).toEqual(['fires', 'carbon_monoxide', 'vegetation']);
  });

  it('shows every moment when no zone is selected', () => {
    expect(getMomentsForZone(null, 1880, 2025)).toHaveLength(keyMoments.length);
  });

  it('shows only the moments of the selected zone', () => {
    expect(getMomentsForZone('pakistan', 1880, 2025).map((m) => m.id)).toEqual([
      'pakistan-floods-2022',
    ]);
    expect(getMomentsForZone('usa', 1880, 2025)).toHaveLength(5);
    expect(getMomentsForZone('oman', 1880, 2025).map((m) => m.id)).toEqual([
      'uae-oman-floods-2024',
    ]);
    expect(getMomentsForZone('switzerland', 1880, 2025)).toEqual([]);
  });

  it('also lists the moments of a country under its continent', () => {
    const ids = (zone: string) => getMomentsForZone(zone, 1880, 2025).map((m) => m.id);
    expect(ids('asia')).toEqual([
      'russian-heatwave-2010', // Russia belongs to Asia in the zone data
      'indonesia-peat-fires-2015',
      'yakutia-wildfires-2021',
      'pakistan-floods-2022',
      'uae-oman-floods-2024', // two Asian countries: listed once
    ]);
    expect(ids('northAmerica')).toEqual([
      'cleaner-air-usa',
      'us-drought-2012',
      'hurricane-harvey-2017',
      'california-wildfires-2020',
      'winter-storm-uri-2021',
      'quebec-wildfires-2023',
      'nwt-alberta-wildfires-2023',
    ]);
    expect(ids('europe')).toEqual([
      'cleaner-air-europe', // tied to the continent itself
      'beast-from-the-east-2018',
      'storm-filomena-2021',
      'europe-drought-2022', // tied to the continent itself
    ]);
    expect(ids('africa')).toEqual(['storm-daniel-2023']);
    expect(ids('oceania')).toEqual(['black-summer-2019']);
    expect(ids('southAmerica')).toEqual(['amazon-fires-2024']);
    // Not the other way round: a continent's moment is not listed under its countries
    expect(ids('india')).toEqual([]);
  });

  it('is not active on the continent around its zone (the card offers the zone itself)', () => {
    const moments = getMomentsForZone('asia', 1880, 2025);
    const i = moments.findIndex((m) => m.id === 'pakistan-floods-2022');
    expect(decodeMomentStatus(encodeMomentStatuses(moments, periodToYear('2022-08'), 'asia'), i)).toBe('upcoming');
  });

  it('leaves out moments outside the data range', () => {
    const ids = getMomentsForZone(null, 1880, 2020).map((m) => m.id);
    expect(ids).toContain('black-summer-2019');
    expect(ids).not.toContain('pakistan-floods-2022');
  });

  it('encodes each moment status relative to the position', () => {
    // Cleaner air 2004–2024 (a trend: active alongside the others), US drought 2012,
    // Harvey 2017, California 2020, Uri 2021
    const moments = getMomentsForZone('usa', 1880, 2025);
    const s = encodeMomentStatuses(moments, periodToYear('2020-09') + 0.01, 'usa');
    expect([0, 1, 2, 3, 4].map((i) => decodeMomentStatus(s, i))).toEqual(['active', 'past', 'past', 'active', 'upcoming']);
    expect(encodeMomentStatuses(moments, null, 'usa')).toBe('uuuuu');
    // The window includes its whole last month
    expect(decodeMomentStatus(encodeMomentStatuses(moments, periodToYear('2017-09') + 0.08, 'usa'), 2)).toBe('active');
  });

  it('is active from one month before to one month after the event', () => {
    const moments = getMomentsForZone('pakistan', 1880, 2025); // peak Aug 2022
    const status = (period: string, offset = 0) =>
      decodeMomentStatus(encodeMomentStatuses(moments, periodToYear(period) + offset, 'pakistan'), 0);
    expect(status('2022-06', 0.08)).toBe('upcoming'); // end of June: two months before
    expect(status('2022-07')).toBe('active'); // start of the month before
    expect(status('2022-08')).toBe('active');
    expect(status('2022-09', 0.08)).toBe('active'); // end of the month after
    expect(status('2022-10')).toBe('past'); // two months after
  });

  it('is only active in its own zone', () => {
    const moments = getMomentsForZone(null, 1880, 2025);
    const i = moments.findIndex((m) => m.id === 'pakistan-floods-2022');
    const at = periodToYear('2022-08');
    expect(decodeMomentStatus(encodeMomentStatuses(moments, at, 'pakistan'), i)).toBe('active');
    expect(decodeMomentStatus(encodeMomentStatuses(moments, at, null), i)).toBe('upcoming');
    expect(decodeMomentStatus(encodeMomentStatuses(moments, at, 'india'), i)).toBe('upcoming');
  });
});
