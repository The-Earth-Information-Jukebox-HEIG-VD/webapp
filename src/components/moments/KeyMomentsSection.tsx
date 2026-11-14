import { useTranslation } from 'react-i18next';
import { getMomentsInRange } from '../../data/keyMoments';
import { KeyMomentCard } from './KeyMomentCard';
import './KeyMomentsSection.css';

interface KeyMomentsSectionProps {
  startYear: number;
  endYear: number;
  currentYear: number;
  onJumpToMoment: (year: number) => void;
}

/**
 * Section displaying key climate moments as clickable cards
 *
 * Allows users to quickly jump to significant events in the timeline.
 */
export function KeyMomentsSection({
  startYear,
  endYear,
  currentYear,
  onJumpToMoment,
}: KeyMomentsSectionProps) {
  const { t } = useTranslation();

  const moments = getMomentsInRange(startYear, endYear);

  // Group moments by significance
  const highSignificance = moments.filter((m) => m.significance === 'high');

  return (
    <section
      className="key-moments-section"
      aria-label={t('moments.title')}
    >
      <h2 className="moments-title">{t('moments.title')}</h2>

      <div className="moments-grid" role="list">
        {highSignificance.map((moment) => (
          <KeyMomentCard
            key={moment.id}
            moment={moment}
            isActive={currentYear === moment.year}
            isPast={currentYear > moment.year}
            onJump={() => onJumpToMoment(moment.year)}
          />
        ))}
      </div>
    </section>
  );
}

export default KeyMomentsSection;
