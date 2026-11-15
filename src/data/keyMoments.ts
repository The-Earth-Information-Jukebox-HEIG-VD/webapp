import type { KeyMoment, MomentDataset, MomentImageCredit } from '../types/keyMoments';
import { addMonths, periodToYear } from '../services/sonificationApi';
import { findZoneFeature } from './zones';

import russiaImg from '../assets/events/russian-heatwave-2010.jpg';
import usDroughtImg from '../assets/events/us-drought-2012.jpg';
import arcticIce2012Img from '../assets/events/arctic-sea-ice-2012.jpg';
import indonesiaImg from '../assets/events/indonesia-peat-fires-2015.jpg';
import elNinoImg from '../assets/events/el-nino-2015.jpg';
import harveyImg from '../assets/events/hurricane-harvey-2017.jpg';
import beastImg from '../assets/events/beast-from-the-east-2018.jpg';
import blackSummerImg from '../assets/events/black-summer-2019.jpg';
import californiaImg from '../assets/events/california-wildfires-2020.jpg';
import filomenaImg from '../assets/events/storm-filomena-2021.jpg';
import uriImg from '../assets/events/winter-storm-uri-2021.jpg';
import yakutiaImg from '../assets/events/yakutia-wildfires-2021.jpg';
import tongaImg from '../assets/events/hunga-tonga-2022.jpg';
import pakistanImg from '../assets/events/pakistan-floods-2022.jpg';
import europeDroughtImg from '../assets/events/europe-drought-2022.jpg';
import antarcticIceImg from '../assets/events/antarctic-sea-ice-2023.jpg';
import quebecImg from '../assets/events/quebec-wildfires-2023.jpg';
import nwtAlbertaImg from '../assets/events/nwt-alberta-wildfires-2023.jpg';
import danielImg from '../assets/events/storm-daniel-2023.jpg';
import uaeOmanImg from '../assets/events/uae-oman-floods-2024.jpg';
import amazonImg from '../assets/events/amazon-fires-2024.jpg';
import arcticWinterIceImg from '../assets/events/arctic-winter-ice-2025.jpg';
// Charts made by the team from the NASA carbon monoxide data
import cleanerAirUsaImg from '../assets/events/cleaner-air-usa.png';
import cleanerAirEuropeImg from '../assets/events/cleaner-air-europe.png';

/** Months of margin played before and after the event */
export const MOMENT_MARGIN_MONTHS = 1;

interface MomentDef {
  id: string;
  i18nKey: string;
  category: KeyMoment['category'];
  datasets: MomentDataset[];
  /** 'YYYY-MM', or ['YYYY-MM', 'YYYY-MM'] for a peak lasting several months */
  peak: string | [string, string];
  zoneIds: string[];
  image?: string;
  imageKind?: KeyMoment['imageKind'];
  credit?: MomentImageCredit;
}

/** Wikimedia Commons page of a file, by its page id */
const commons = (curid: number) => `https://commons.wikimedia.org/?curid=${curid}`;

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
 * Key events you can jump to: extreme events, the 2015–16 El Niño and long-term
 * trends (cleaner air), each tied to the zone where it happened (the dates are the
 * months where it shows in our data).
 */
const TEAM_CHART_CREDIT: MomentImageCredit = { author: 'EarthChestra team', licence: 'NASA carbon monoxide data' };

const MOMENT_DEFS: MomentDef[] = [
  // Long-term trends: carbon monoxide fell as the vehicle emission rules came in
  // (charts: each year vs the same months of 2001–2005)
  { id: 'cleaner-air-usa', i18nKey: 'cleanerAirUsa', category: 'event', datasets: ['carbon_monoxide'], peak: ['2004-01', '2024-12'], zoneIds: ['usa'],
    image: cleanerAirUsaImg, imageKind: 'chart', credit: TEAM_CHART_CREDIT },
  { id: 'cleaner-air-europe', i18nKey: 'cleanerAirEurope', category: 'event', datasets: ['carbon_monoxide'], peak: ['2005-01', '2024-12'], zoneIds: ['europe'],
    image: cleanerAirEuropeImg, imageKind: 'chart', credit: TEAM_CHART_CREDIT },
  { id: 'russian-heatwave-2010', i18nKey: 'russia2010', category: 'event', datasets: ['vegetation', 'carbon_monoxide'], peak: ['2010-07', '2010-08'], zoneIds: ['russia'],
    image: russiaImg, credit: { author: 'Alexander Annenkov', licence: 'CC BY 2.0', url: commons(133623470) } },
  { id: 'us-drought-2012', i18nKey: 'usDrought2012', category: 'event', datasets: ['vegetation'], peak: '2012-07', zoneIds: ['usa'],
    image: usDroughtImg, credit: { author: 'Lance Cheung / USDA', licence: 'public domain', url: commons(133641515) } },
  { id: 'arctic-sea-ice-2012', i18nKey: 'arcticIce2012', category: 'event', datasets: ['sea_ice'], peak: '2012-09', zoneIds: ['arcticOcean'],
    image: arcticIce2012Img, credit: { author: 'Mario Hoppmann / NASA Goddard', licence: 'CC BY 2.0', url: commons(51567523) } },
  { id: 'indonesia-peat-fires-2015', i18nKey: 'indonesiaFires2015', category: 'event', datasets: ['fires', 'carbon_monoxide', 'precipitation'], peak: ['2015-09', '2015-10'], zoneIds: ['indonesia'],
    image: indonesiaImg, credit: { author: 'NASA (MODIS)', licence: 'public domain', url: commons(145365930) } },
  // El Niño (equatorial Pacific): heard in the rain, chlorophyll, vegetation and fires it shifts
  { id: 'el-nino-2015', i18nKey: 'elNino2015', category: 'elNino', datasets: ['precipitation', 'chlorophyll', 'vegetation', 'fires', 'carbon_monoxide'], peak: ['2015-11', '2016-01'], zoneIds: ['pacificOcean'],
    image: elNinoImg, credit: { author: 'Vardhan Patankar', licence: 'CC BY-SA 4.0', url: commons(62822698) } },
  { id: 'hurricane-harvey-2017', i18nKey: 'harvey2017', category: 'event', datasets: ['precipitation'], peak: '2017-08', zoneIds: ['usa'],
    image: harveyImg, credit: { author: 'U.S. CBP', licence: 'public domain', url: commons(66504466) } },
  { id: 'beast-from-the-east-2018', i18nKey: 'beastFromTheEast2018', category: 'event', datasets: ['snow'], peak: '2018-03', zoneIds: ['uk'],
    image: beastImg, credit: { author: 'Irid Escent', licence: 'CC BY-SA 2.0', url: commons(74041521) } },
  { id: 'black-summer-2019', i18nKey: 'blackSummer2019', category: 'event', datasets: ['fires', 'carbon_monoxide', 'vegetation'], peak: ['2019-12', '2020-01'], zoneIds: ['australia'],
    image: blackSummerImg, credit: { author: 'Cazz', licence: 'public domain', url: commons(94183729) } },
  { id: 'california-wildfires-2020', i18nKey: 'california2020', category: 'event', datasets: ['fires'], peak: '2020-09', zoneIds: ['usa'],
    image: californiaImg, credit: { author: 'Christopher Michel', licence: 'CC BY 2.0', url: commons(93996320) } },
  { id: 'storm-filomena-2021', i18nKey: 'filomena2021', category: 'event', datasets: ['snow'], peak: '2021-01', zoneIds: ['spain'],
    image: filomenaImg, credit: { author: 'Benjamín Núñez González', licence: 'CC BY-SA 4.0', url: commons(98690648) } },
  { id: 'winter-storm-uri-2021', i18nKey: 'uri2021', category: 'event', datasets: ['snow'], peak: '2021-02', zoneIds: ['usa'],
    image: uriImg, credit: { author: 'NOAA (GOES-16)', licence: 'public domain', url: commons(99906253) } },
  { id: 'yakutia-wildfires-2021', i18nKey: 'yakutia2021', category: 'event', datasets: ['fires'], peak: '2021-07', zoneIds: ['russia'],
    image: yakutiaImg, credit: { author: 'NOAA', licence: 'public domain', url: commons(149079773) } },
  // Tonga has no country polygon: the eruption is heard in the Pacific Ocean zone
  { id: 'hunga-tonga-2022', i18nKey: 'hungaTonga2022', category: 'event', datasets: ['lightning'], peak: '2022-01', zoneIds: ['pacificOcean'],
    image: tongaImg, credit: { author: 'CSU/CIRA & JMA', licence: 'public domain', url: commons(164581269) } },
  { id: 'pakistan-floods-2022', i18nKey: 'pakistan2022', category: 'event', datasets: ['precipitation'], peak: '2022-08', zoneIds: ['pakistan'],
    image: pakistanImg, credit: { author: 'Julien Harneis', licence: 'CC BY-SA 2.0', url: commons(134976704) } },
  { id: 'europe-drought-2022', i18nKey: 'europeDrought2022', category: 'event', datasets: ['vegetation'], peak: '2022-08', zoneIds: ['europe'],
    image: europeDroughtImg, credit: { author: 'Florian Pépellin', licence: 'CC BY-SA 4.0', url: commons(121223773) } },
  // Two record lows (Feb and Sep): the jump plays the whole Jan – Oct span between them
  { id: 'antarctic-sea-ice-2023', i18nKey: 'antarcticIce2023', category: 'event', datasets: ['sea_ice'], peak: ['2023-02', '2023-09'], zoneIds: ['southernOcean'],
    image: antarcticIceImg, credit: { author: 'Brocken Inaglory', licence: 'CC BY-SA 4.0', url: commons(3490530) } },
  { id: 'quebec-wildfires-2023', i18nKey: 'quebec2023', category: 'event', datasets: ['fires', 'carbon_monoxide'], peak: '2023-06', zoneIds: ['canada'],
    image: quebecImg, credit: { author: 'P. Markuse / Copernicus', licence: 'CC BY 2.0', url: commons(133607904) } },
  { id: 'nwt-alberta-wildfires-2023', i18nKey: 'nwtAlberta2023', category: 'event', datasets: ['fires', 'carbon_monoxide'], peak: '2023-08', zoneIds: ['canada'],
    image: nwtAlbertaImg, credit: { author: 'P. Markuse / Copernicus', licence: 'CC BY 2.0', url: commons(132479970) } },
  { id: 'storm-daniel-2023', i18nKey: 'daniel2023', category: 'event', datasets: ['precipitation'], peak: '2023-09', zoneIds: ['libya'],
    image: danielImg, credit: { author: 'NASA (VIIRS)', licence: 'public domain', url: commons(137274236) } },
  { id: 'uae-oman-floods-2024', i18nKey: 'uaeOman2024', category: 'event', datasets: ['precipitation'], peak: '2024-04', zoneIds: ['unitedArabEmirates', 'oman'],
    image: uaeOmanImg, credit: { author: 'Zizup', licence: 'CC0', url: commons(148969642) } },
  { id: 'amazon-fires-2024', i18nKey: 'amazon2024', category: 'event', datasets: ['carbon_monoxide'], peak: '2024-09', zoneIds: ['brazil'],
    image: amazonImg, credit: { author: 'NASA (MODIS)', licence: 'public domain', url: commons(151936981) } },
  { id: 'arctic-winter-ice-2025', i18nKey: 'arcticWinterIce2025', category: 'event', datasets: ['sea_ice'], peak: '2025-03', zoneIds: ['arcticOcean'],
    image: arcticWinterIceImg, credit: { author: 'Gary Banziger / NASA Langley', licence: 'public domain', url: commons(179332082) } },
];

export const keyMoments: KeyMoment[] = MOMENT_DEFS.map(defineMoment);

/** Fractional-year bounds [from, to) of a moment's window (to = end of its last month) */
export function momentBounds(m: KeyMoment): [number, number] {
  return [periodToYear(m.start), periodToYear(m.end) + 1 / 12];
}

/**
 * Whether a moment happened in a zone: one of its own zones, or the zone that
 * contains one of them (`parentId`: a country's continent, a sea's ocean), so
 * the Pakistan floods are also listed under Asia.
 */
export function momentInZone(m: KeyMoment, zoneId: string): boolean {
  return m.zoneIds.some((id) => id === zoneId || findZoneFeature(id)?.properties.parentId === zoneId);
}

/**
 * Moments to show for the selected zone: all of them when no zone is selected,
 * otherwise those that happened in that zone or in a country (sea) inside it.
 * Moments outside the
 * enabled tracks' data range [startYear, endYear] are left out.
 */
export function getMomentsForZone(
  zoneId: string | null,
  startYear: number,
  endYear: number
): KeyMoment[] {
  return keyMoments.filter((m) => {
    if (zoneId !== null && !momentInZone(m, zoneId)) return false;
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
 * the selected one: the same months in another zone are not that event. On the
 * continent (ocean) around it the card offers to select the event's own zone, so
 * it is not 'active' there either.
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
