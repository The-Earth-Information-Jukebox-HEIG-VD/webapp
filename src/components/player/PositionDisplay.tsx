import { useTranslation } from 'react-i18next';
import './PositionDisplay.css';

interface PositionDisplayProps {
  currentYear: number;
  progress: number;
  startYear: number;
  endYear: number;
}

/**
 * Position display showing current year and progress percentage
 */
export function PositionDisplay({
  currentYear,
  progress,
  startYear,
  endYear,
}: PositionDisplayProps) {
  const { t } = useTranslation('player');

  const elapsedYears = currentYear - startYear;
  const remainingYears = endYear - currentYear;
  const progressPercent = Math.round(progress * 100);

  return (
    <div className="position-display">
      <div className="position-year">
        <span className="position-label">{t('position.currentYear')}</span>
        <span className="position-value">{currentYear}</span>
      </div>
      <div className="position-progress">
        <span className="progress-bar">
          <span
            className="progress-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </span>
        <span className="progress-text">{progressPercent}%</span>
      </div>
      <div className="position-details">
        <span className="detail">
          +{elapsedYears} / -{remainingYears}
        </span>
      </div>
    </div>
  );
}

export default PositionDisplay;
