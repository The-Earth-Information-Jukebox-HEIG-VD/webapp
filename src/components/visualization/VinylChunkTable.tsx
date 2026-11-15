import { useTranslation } from 'react-i18next';
import type { Track } from '../../types/tracks';
import type { VinylChunkMeta, VinylTravel } from '../../services/vinylApi';
import { periodToYear } from '../../services/sonificationApi';
import { formatMonthYear } from '../../utils/formatDate';
import { VINYL_CHUNKS, formatLatLng, needlePoint, type LatLng } from '../../utils/vinylGeometry';
import { regionNameAt } from '../../utils/regionName';
import { formatReading, isAnomalyUnits } from '../../utils/reading';
import { useHemisphereLabels } from './useHemisphereLabels';

interface VinylChunkTableProps {
  center: LatLng;
  /** Localised month played, e.g. "March 2020" */
  monthLabel: string;
  /** Grooves heard so far, by index */
  history: Record<number, VinylChunkMeta>;
  /** Enabled tracks (one value column each) */
  tracks: Track[];
  /** Groove under the needle, or null when nothing plays */
  currentIndex: number | null;
  /** Time and both travel add a Date column (default 'space') */
  travel?: VinylTravel;
  className?: string;
}

/**
 * Text alternative to the record: one row per groove with where it starts and
 * ends, the region it crosses and the values heard there (once played).
 */
export function VinylChunkTable({
  center,
  monthLabel,
  history,
  tracks,
  currentIndex,
  travel = 'space',
  className = 'sr-only',
}: VinylChunkTableProps) {
  const { t, i18n } = useTranslation();
  const hemis = useHemisphereLabels();
  const fmt = (p: LatLng) => formatLatLng(p, i18n.language, hemis);
  const showDate = travel !== 'space';
  const month = (period: string) => formatMonthYear(periodToYear(period), i18n.language);
  const dateOf = (meta: VinylChunkMeta) =>
    meta.periods.length > 1
      ? t('vinyl.tableDateRange', { from: month(meta.periods[0]), to: month(meta.periods[meta.periods.length - 1]) })
      : month(meta.periods[0] ?? meta.timePeriod);

  return (
    <table className={className}>
      <caption>
        {t(travel === 'space' ? 'vinyl.table.caption' : 'vinyl.tableCaptionTravel', {
          centre: fmt(center),
          month: monthLabel,
        })}
        . {t('vinyl.table.meanNote')}
      </caption>
      <thead>
        <tr>
          <th scope="col">{t('vinyl.table.groove')}</th>
          <th scope="col">{t('vinyl.table.start')}</th>
          <th scope="col">{t('vinyl.table.end')}</th>
          <th scope="col">{t('vinyl.table.region')}</th>
          {showDate && <th scope="col">{t('vinyl.tableDate')}</th>}
          {tracks.map((tr) => (
            <th scope="col" key={tr.id}>
              {t(tr.nameKey, { defaultValue: tr.label })}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: VINYL_CHUNKS }, (_, k) => {
          const heard = history[k];
          const start = needlePoint(center, k / VINYL_CHUNKS);
          const end = needlePoint(center, (k + 1) / VINYL_CHUNKS);
          const mid = needlePoint(center, (k + 0.5) / VINYL_CHUNKS);
          return (
            <tr key={k} aria-current={currentIndex === k ? 'true' : undefined}>
              <th scope="row">
                {t('vinyl.grooveOf', { k: k + 1, n: VINYL_CHUNKS })}
                {currentIndex === k && ` (${t('vinyl.table.playing')})`}
              </th>
              <td>{fmt(start)}</td>
              <td>{fmt(end)}</td>
              <td>{regionNameAt(mid, t) ?? '—'}</td>
              {showDate && <td>{heard ? dateOf(heard) : t('vinyl.table.notPlayed')}</td>}
              {tracks.map((tr) => {
                const v = heard?.values[tr.id];
                return (
                  <td key={tr.id}>
                    {!heard
                      ? t('vinyl.table.notPlayed')
                      : v === undefined
                        ? t('vinyl.table.noData')
                        : formatReading(v, tr.units, isAnomalyUnits(tr.units), t)}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default VinylChunkTable;
