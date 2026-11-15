/** Dataset (track id) in which a key event is visible */
export type MomentDataset = 'fires' | 'precipitation' | 'snow' | 'lightning' | 'temperature';

/**
 * Key event: an extreme event or El Niño episode tied to one place and a few months.
 *
 * Periods are 'YYYY-MM'. `start`/`end` frame the event with one month of margin
 * on each side, so you hear the data before and after it.
 */
export interface KeyMoment {
  id: string;
  /** i18n key prefix: moments.<key>.title / .when / .imageAlt */
  i18nKey: string;
  category: 'event' | 'elNino';
  dataset: MomentDataset;
  /** First and last month where the event shows in our data */
  peakStart: string;
  peakEnd: string;
  /** Window played by the jump: peakStart − 1 month .. peakEnd + 1 month */
  start: string;
  end: string;
  /** Zone feature ids (src/data/zones). The first one is selected on click. */
  zoneIds: string[];
  /** Bundled photo URL (Vite import), if any */
  image?: string;
}
