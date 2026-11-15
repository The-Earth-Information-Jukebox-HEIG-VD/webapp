import { useTranslation } from 'react-i18next';
import type { Track } from '../../types/tracks';
import type { VinylChunkMeta, VinylTravel } from '../../services/vinylApi';
import { VINYL_CHUNKS, formatLatLng, needlePoint, type LatLng } from '../../utils/vinylGeometry';
import { regionNameAt } from '../../utils/regionName';
import { VinylChunkTable } from './VinylChunkTable';
import { useHemisphereLabels } from './useHemisphereLabels';
import './VinylGlobeView.css';

interface VinylRecordViewProps {
  center: LatLng;
  monthLabel: string;
  chunkIndex: number;
  started: boolean;
  history: Record<number, VinylChunkMeta>;
  tracks: Track[];
  travel?: VinylTravel;
}

const SIZE = 200;
const OUTER = 92;
const INNER = 18;

/**
 * Vinyl mode without WebGL: a schematic record (grooves, the current one
 * highlighted) and the groove table shown as a regular, visible table.
 * It changes once per groove, so it never moves continuously.
 */
export function VinylRecordView({ center, monthLabel, chunkIndex, started, history, tracks, travel = 'space' }: VinylRecordViewProps) {
  const { t, i18n } = useTranslation();
  const hemis = useHemisphereLabels();
  const current = started ? chunkIndex : null;
  const needle = needlePoint(center, started ? (chunkIndex + 0.5) / VINYL_CHUNKS : 0);
  const region = regionNameAt(needle, t);
  const ringRadius = (k: number) => OUTER - ((OUTER - INNER) * (k + 0.5)) / VINYL_CHUNKS;

  return (
    <div className="vinyl-record-view">
      <svg
        className="vinyl-record-svg"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={t(travel === 'time' ? 'vinyl.recordLabelTime' : 'vinyl.recordLabel', { centre: formatLatLng(center, i18n.language, hemis), month: monthLabel })}
      >
        <circle cx={SIZE / 2} cy={SIZE / 2} r={OUTER + 4} fill="#141418" />
        {Array.from({ length: VINYL_CHUNKS }, (_, k) => (
          <circle
            key={k}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={ringRadius(k)}
            className={current === k ? 'vinyl-record-groove is-current' : 'vinyl-record-groove'}
          />
        ))}
        <circle cx={SIZE / 2} cy={SIZE / 2} r={INNER - 2} fill="#1a73e8" />
        <circle cx={SIZE / 2} cy={SIZE / 2} r={3} fill="#ffffff" />
        {current !== null && <circle cx={SIZE / 2 + ringRadius(current)} cy={SIZE / 2} r={5} fill="#ffb74d" stroke="#0a0e17" />}
      </svg>
      <p className="vinyl-record-status">
        {monthLabel} · {t('vinyl.grooveOf', { k: (current ?? 0) + 1, n: VINYL_CHUNKS })}
        {region && ` · ${t('vinyl.caption.near', { region })}`}
      </p>
      <VinylChunkTable
        className="vinyl-record-table"
        center={center}
        monthLabel={monthLabel}
        history={history}
        tracks={tracks}
        currentIndex={current}
        travel={travel}
      />
    </div>
  );
}

export default VinylRecordView;
