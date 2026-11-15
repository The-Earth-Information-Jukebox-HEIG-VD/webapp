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
    expect([blackSummer.start, blackSummer.end]).toEqual(['2019-11', '2020-01']);
    const godzilla = keyMoments.find((m) => m.id === 'el-nino-2015')!;
    expect([godzilla.start, godzilla.end]).toEqual(['2015-10', '2016-02']);
  });

  it('has an image for every extreme event', () => {
    for (const m of keyMoments.filter((m) => m.category === 'event')) {
      expect(m.image, m.id).toBeTruthy();
    }
  });

  it('shows every moment when no zone is selected', () => {
    expect(getMomentsForZone(null, 1880, 2025)).toHaveLength(keyMoments.length);
  });

  it('shows only the moments of the selected zone', () => {
    expect(getMomentsForZone('pakistan', 1880, 2025).map((m) => m.id)).toEqual([
      'pakistan-floods-2022',
    ]);
    expect(getMomentsForZone('usa', 1880, 2025)).toHaveLength(3);
    expect(getMomentsForZone('oman', 1880, 2025).map((m) => m.id)).toEqual([
      'uae-oman-floods-2024',
    ]);
    expect(getMomentsForZone('switzerland', 1880, 2025)).toEqual([]);
  });

  it('leaves out moments outside the data range', () => {
    const ids = getMomentsForZone(null, 1880, 2020).map((m) => m.id);
    expect(ids).toContain('black-summer-2019');
    expect(ids).not.toContain('pakistan-floods-2022');
  });

  it('encodes each moment status relative to the position', () => {
    const moments = getMomentsForZone('usa', 1880, 2025); // Harvey 2017, California 2020, Uri 2021
    const s = encodeMomentStatuses(moments, periodToYear('2020-09') + 0.01, 'usa');
    expect([0, 1, 2].map((i) => decodeMomentStatus(s, i))).toEqual(['past', 'active', 'upcoming']);
    expect(encodeMomentStatuses(moments, null, 'usa')).toBe('uuu');
    // The window includes its whole last month
    expect(decodeMomentStatus(encodeMomentStatuses(moments, periodToYear('2017-09') + 0.08, 'usa'), 0)).toBe('active');
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
