/** Dataset (track id) in which a key event is visible */
export type MomentDataset =
  | 'fires'
  | 'precipitation'
  | 'snow'
  | 'lightning'
  | 'temperature'
  | 'sea_ice'
  | 'vegetation'
  | 'carbon_monoxide'
  | 'chlorophyll';

/** Source of an event photo (shown under the card, linked when `url` is set) */
export interface MomentImageCredit {
  author: string;
  licence: string;
  url?: string;
}

/**
 * Key event: an extreme event or El Niño episode tied to one place and a few months,
 * or a long-term trend (e.g. cleaner air after vehicle emission rules) over years.
 *
 * Periods are 'YYYY-MM'. `start`/`end` frame the event with one month of margin
 * on each side, so you hear the data before and after it.
 */
export interface KeyMoment {
  id: string;
  /** i18n key prefix: moments.<key>.title / .when / .imageAlt (optional .inData) */
  i18nKey: string;
  category: 'event' | 'elNino';
  /** Datasets that show the event: all of them are enabled by the jump */
  datasets: MomentDataset[];
  /** First and last month where the event shows in our data */
  peakStart: string;
  peakEnd: string;
  /** Window played by the jump: peakStart − 1 month .. peakEnd + 1 month */
  start: string;
  end: string;
  /** Zone feature ids (src/data/zones). The first one is selected on click. */
  zoneIds: string[];
  /** Bundled image URL (Vite import), if any */
  image?: string;
  /** 'chart': a data chart, shown whole (not cropped) and credited as a chart. Default 'photo'. */
  imageKind?: 'photo' | 'chart';
  /** Source of `image` */
  credit?: MomentImageCredit;
}
