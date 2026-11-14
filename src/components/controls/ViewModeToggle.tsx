import { useTranslation } from 'react-i18next';
import { useViewMode } from '../../contexts/ViewModeContext';
import { InfoTooltip } from './InfoTooltip';
import './ViewModeToggle.css';

/**
 * Toggle between Globe and List view modes
 *
 * Falls back to List view if WebGL is not supported.
 * Includes an info tooltip explaining the accessibility benefit of List view.
 */
export function ViewModeToggle() {
  const { t } = useTranslation();
  const { viewMode, setViewMode, isGlobeSupported } = useViewMode();

  return (
    <div className="view-mode-toggle" role="group" aria-label={t('viewMode.toggle')}>
      <button
        type="button"
        className={`view-mode-button ${viewMode === 'globe' ? 'active' : ''}`}
        onClick={() => setViewMode('globe')}
        disabled={!isGlobeSupported}
        aria-pressed={viewMode === 'globe'}
        aria-label={t('viewMode.globe')}
        title={!isGlobeSupported ? t('errors.webglNotSupported') : undefined}
      >
        <GlobeIcon />
        <span className="view-mode-label">{t('viewMode.globe')}</span>
      </button>

      <button
        type="button"
        className={`view-mode-button ${viewMode === 'list' ? 'active' : ''}`}
        onClick={() => setViewMode('list')}
        aria-pressed={viewMode === 'list'}
        aria-label={t('viewMode.list')}
      >
        <ListIcon />
        <span className="view-mode-label">{t('viewMode.list')}</span>
      </button>

      <InfoTooltip>
        <p><strong>{t('viewMode.globe')}:</strong> {t('viewMode.globeDescription')}</p>
        <p><strong>{t('viewMode.list')}:</strong> {t('viewMode.listDescription')}</p>
      </InfoTooltip>
    </div>
  );
}

function GlobeIcon() {
  return (
    <svg
      className="view-mode-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg
      className="view-mode-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

export default ViewModeToggle;
