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
}

/**
 * Key events (extreme events, El Niño) as clickable cards.
 *
 * Only the events of the selected zone are listed; with no zone, all of them.
 */
export function KeyMomentsSection({
  startYear,
  endYear,
  selectedZone,
  positionStore,
  onJumpToMoment,
}: KeyMomentsSectionProps) {
  const { t } = useTranslation();

  const moments = useMemo(
    () => getMomentsForZone(selectedZone, startYear, endYear),
    [selectedZone, startYear, endYear]
  );

  // One character per moment: re-renders only when a moment changes status
  const statuses = usePlaybackPosition(positionStore, (position) =>
    encodeMomentStatuses(moments, position)
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
              showZone={selectedZone === null}
              onJump={() => onJumpToMoment(moment)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export default KeyMomentsSection;
