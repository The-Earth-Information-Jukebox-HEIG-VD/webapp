import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  decodeMomentStatus,
  encodeMomentStatuses,
  getMomentsForZone,
} from '../../data/keyMoments';
import type { KeyMoment } from '../../types/keyMoments';
import { usePlaybackPosition, type PositionStore } from '../../hooks/usePlaybackPosition';
import { getZoneDisplayName } from '../../utils/zoneName';
import { snapToMonth } from '../../services/sonificationApi';
import { KeyMomentCard } from './KeyMomentCard';
import './KeyMomentsSection.css';

interface KeyMomentsSectionProps {
  startYear: number;
  endYear: number;
  /** Selected zone id, or null when no zone is selected (then every event is shown) */
  selectedZone: string | null;
  /** Fine playback position (fractional year) */
  positionStore: PositionStore;
  onJumpToMoment: (moment: KeyMoment) => void;
  /** Month travel (1-12): the playhead stands for that month of its year */
  monthFilter?: number | null;
}

/**
 * Key events (extreme events, El Niño) as clickable cards.
 *
 * Only the events of the selected zone (or of the countries / seas inside it) are
 * listed; with no zone, all of them. An event whose own zone is not the selected
 * one shows its zone, and playing it selects that zone.
 */
export function KeyMomentsSection({
  startYear,
  endYear,
  selectedZone,
  positionStore,
  onJumpToMoment,
  monthFilter = null,
}: KeyMomentsSectionProps) {
  const { t } = useTranslation();

  const moments = useMemo(
    () => getMomentsForZone(selectedZone, startYear, endYear),
    [selectedZone, startYear, endYear]
  );

  // One character per moment: re-renders only when a moment changes status.
  // In month travel the playhead crosses a whole year per bar: use the month it
  // stands for (the one the timeline shows), not the raw position.
  const statuses = usePlaybackPosition(positionStore, (position) =>
    encodeMomentStatuses(
      moments,
      position === null ? null : snapToMonth(position, monthFilter),
      selectedZone
    )
  );

  return (
    <section className="key-moments-section" aria-labelledby="key-moments-title">
      <h2 id="key-moments-title" className="moments-title">{t('moments.title')}</h2>

      {moments.length === 0 ? (
        <p className="moments-empty">
          {t('moments.emptyForZone', {
            zone: selectedZone ? getZoneDisplayName(selectedZone, t) : '',
          })}
        </p>
      ) : (
        <ul className="moments-grid">
          {moments.map((moment, i) => (
            <KeyMomentCard
              key={moment.id}
              moment={moment}
              status={decodeMomentStatus(statuses, i)}
              showZone={selectedZone === null || !moment.zoneIds.includes(selectedZone)}
              onJump={() => onJumpToMoment(moment)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export default KeyMomentsSection;
