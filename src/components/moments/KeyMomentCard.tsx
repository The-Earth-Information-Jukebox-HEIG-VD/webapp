import { useTranslation } from 'react-i18next';
import type { KeyMoment } from '../../types/keyMoments';
import './KeyMomentCard.css';

interface KeyMomentCardProps {
  moment: KeyMoment;
  isActive: boolean;
  isPast: boolean;
  onJump: () => void;
}

/**
 * Card displaying a key climate moment
 */
export function KeyMomentCard({
  moment,
  isActive,
  isPast,
  onJump,
}: KeyMomentCardProps) {
  const { t } = useTranslation();

  const categoryIcons: Record<string, string> = {
    warming: '🌡️',
    extreme: '⚠️',
    milestone: '📍',
    agreement: '🤝',
  };

  return (
    <article
      className={`key-moment-card ${moment.category} ${isActive ? 'active' : ''} ${isPast ? 'past' : ''}`}
      role="listitem"
    >
      <div className="moment-header">
        <span className="moment-category" aria-hidden="true">
          {categoryIcons[moment.category]}
        </span>
        <span className="moment-year">{moment.year}</span>
      </div>

      <h3 className="moment-title">{t(moment.titleKey)}</h3>
      <p className="moment-description">{t(moment.descriptionKey)}</p>

      <button
        type="button"
        className="moment-jump-button"
        onClick={onJump}
        aria-label={`${t('moments.jumpTo')}: ${t(moment.titleKey)} (${moment.year})`}
      >
        <JumpIcon />
        <span>{t('moments.jumpTo')}</span>
      </button>

      {isActive && (
        <div className="moment-active-indicator" aria-label="Currently playing">
          <span className="playing-dot" />
          <span className="playing-dot" />
          <span className="playing-dot" />
        </div>
      )}
    </article>
  );
}

function JumpIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

export default KeyMomentCard;
