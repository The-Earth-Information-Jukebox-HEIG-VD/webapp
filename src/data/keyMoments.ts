import type { KeyMoment, MomentDataset } from '../types/keyMoments';
import { addMonths, periodToYear } from '../services/sonificationApi';

import indonesiaImg from '../assets/events/indonesia-peat-fires-2015.jpg';
import harveyImg from '../assets/events/hurricane-harvey-2017.jpg';
import blackSummerImg from '../assets/events/black-summer-2019.jpg';
import californiaImg from '../assets/events/california-wildfires-2020.jpg';
import filomenaImg from '../assets/events/storm-filomena-2021.jpg';
import uriImg from '../assets/events/winter-storm-uri-2021.jpg';
import yakutiaImg from '../assets/events/yakutia-wildfires-2021.jpg';
import tongaImg from '../assets/events/hunga-tonga-2022.jpg';
import pakistanImg from '../assets/events/pakistan-floods-2022.jpg';
import quebecImg from '../assets/events/quebec-wildfires-2023.jpg';
import danielImg from '../assets/events/storm-daniel-2023.jpg';
import uaeOmanImg from '../assets/events/uae-oman-floods-2024.jpg';

/** Months of margin played before and after the event */
export const MOMENT_MARGIN_MONTHS = 1;

interface MomentDef {
  id: string;
  i18nKey: string;
  category: KeyMoment['category'];
  dataset: MomentDataset;
  /** 'YYYY-MM', or ['YYYY-MM', 'YYYY-MM'] for a peak lasting several months */
  peak: string | [string, string];
  zoneIds: string[];
  image?: string;
}

function defineMoment({ peak, ...def }: MomentDef): KeyMoment {
  const [peakStart, peakEnd] = typeof peak === 'string' ? [peak, peak] : peak;
  return {
    ...def,
    peakStart,
    peakEnd,
    start: addMonths(peakStart, -MOMENT_MARGIN_MONTHS),
    end: addMonths(peakEnd, MOMENT_MARGIN_MONTHS),
  };
}

/**
 * Key events you can jump to: extreme events and El Niño episodes, each tied
 * to the zone where it happened (the dates are the months where it shows in our data).
 */
const MOMENT_DEFS: MomentDef[] = [
  // El Niño (equatorial Pacific, temperature anomaly)
  { id: 'el-nino-2009', i18nKey: 'elNino2009', category: 'elNino', dataset: 'temperature', peak: ['2009-11', '2010-01'], zoneIds: ['pacificOcean'] },
  { id: 'indonesia-peat-fires-2015', i18nKey: 'indonesiaFires2015', category: 'event', dataset: 'fires', peak: '2015-09', zoneIds: ['indonesia'], image: indonesiaImg },
  { id: 'el-nino-2015', i18nKey: 'elNino2015', category: 'elNino', dataset: 'temperature', peak: ['2015-11', '2016-01'], zoneIds: ['pacificOcean'] },
  { id: 'hurricane-harvey-2017', i18nKey: 'harvey2017', category: 'event', dataset: 'precipitation', peak: '2017-08', zoneIds: ['usa'], image: harveyImg },
  { id: 'black-summer-2019', i18nKey: 'blackSummer2019', category: 'event', dataset: 'fires', peak: '2019-12', zoneIds: ['australia'], image: blackSummerImg },
  { id: 'california-wildfires-2020', i18nKey: 'california2020', category: 'event', dataset: 'fires', peak: '2020-09', zoneIds: ['usa'], image: californiaImg },
  { id: 'storm-filomena-2021', i18nKey: 'filomena2021', category: 'event', dataset: 'snow', peak: '2021-01', zoneIds: ['spain'], image: filomenaImg },
  { id: 'winter-storm-uri-2021', i18nKey: 'uri2021', category: 'event', dataset: 'snow', peak: '2021-02', zoneIds: ['usa'], image: uriImg },
  { id: 'yakutia-wildfires-2021', i18nKey: 'yakutia2021', category: 'event', dataset: 'fires', peak: '2021-07', zoneIds: ['russia'], image: yakutiaImg },
  // Tonga has no country polygon: the eruption is heard in the Pacific Ocean zone
  { id: 'hunga-tonga-2022', i18nKey: 'hungaTonga2022', category: 'event', dataset: 'lightning', peak: '2022-01', zoneIds: ['pacificOcean'], image: tongaImg },
  { id: 'pakistan-floods-2022', i18nKey: 'pakistan2022', category: 'event', dataset: 'precipitation', peak: '2022-08', zoneIds: ['pakistan'], image: pakistanImg },
  { id: 'quebec-wildfires-2023', i18nKey: 'quebec2023', category: 'event', dataset: 'fires', peak: '2023-06', zoneIds: ['canada'], image: quebecImg },
  { id: 'storm-daniel-2023', i18nKey: 'daniel2023', category: 'event', dataset: 'precipitation', peak: '2023-09', zoneIds: ['libya'], image: danielImg },
  { id: 'el-nino-2023', i18nKey: 'elNino2023', category: 'elNino', dataset: 'temperature', peak: ['2023-11', '2024-01'], zoneIds: ['pacificOcean'] },
  { id: 'uae-oman-floods-2024', i18nKey: 'uaeOman2024', category: 'event', dataset: 'precipitation', peak: '2024-04', zoneIds: ['unitedArabEmirates', 'oman'], image: uaeOmanImg },
];

export const keyMoments: KeyMoment[] = MOMENT_DEFS.map(defineMoment);

/** Fractional-year bounds [from, to) of a moment's window (to = end of its last month) */
export function momentBounds(m: KeyMoment): [number, number] {
  return [periodToYear(m.start), periodToYear(m.end) + 1 / 12];
}

/**
 * Moments to show for the selected zone: all of them when no zone is selected,
 * otherwise only those that happened in that zone. Moments outside the
 * enabled tracks' data range [startYear, endYear] are left out.
 */
export function getMomentsForZone(
  zoneId: string | null,
  startYear: number,
  endYear: number
): KeyMoment[] {
  return keyMoments.filter((m) => {
    if (zoneId !== null && !m.zoneIds.includes(zoneId)) return false;
    const [from, to] = momentBounds(m);
    return to > startYear && from < endYear + 1;
  });
}

export type MomentStatus = 'upcoming' | 'active' | 'past';

const STATUS_CODE: Record<MomentStatus, string> = { upcoming: 'u', active: 'a', past: 'p' };
const CODE_STATUS: Record<string, MomentStatus> = { u: 'upcoming', a: 'active', p: 'past' };

/**
 * Status of each moment relative to the position, encoded as one character per
 * moment (a primitive, so a position-store selector only re-renders when a
 * moment changes status, not ~10 times a second).
 *
 * A moment is only 'active' when the playhead is in its window AND its zone is
 * the selected one: the same months in another zone are not that event.
 */
export function encodeMomentStatuses(
  moments: KeyMoment[],
  position: number | null,
  zoneId: string | null
): string {
  return moments
    .map((m) => {
      if (position === null) return STATUS_CODE.upcoming;
      const [from, to] = momentBounds(m);
      if (position < from) return STATUS_CODE.upcoming;
      if (position >= to) return STATUS_CODE.past;
      const inZone = zoneId !== null && m.zoneIds.includes(zoneId);
      return STATUS_CODE[inZone ? 'active' : 'upcoming'];
    })
    .join('');
}

/** Status of the i-th moment from an encodeMomentStatuses string */
export function decodeMomentStatus(encoded: string, index: number): MomentStatus {
  return CODE_STATUS[encoded[index]] ?? 'upcoming';
}

/**
 * Get a moment by ID
 */
export function getMomentById(id: string): KeyMoment | undefined {
  return keyMoments.find((m) => m.id === id);
}

export default keyMoments;
