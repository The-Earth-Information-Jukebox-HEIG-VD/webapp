import { useTranslation } from 'react-i18next';
import { Navigation } from './Navigation';
import { LanguageSelector } from '../controls/LanguageSelector';
import './Header.css';

/**
 * Header component with logo, navigation, and controls
 *
 * Contains the main navigation, language selector, and accessibility toggle.
 * Fixed at the top of the viewport for easy access.
 */
export function Header() {
  const { t } = useTranslation();

  return (
    <header className="header" role="banner">
      <div className="header-container">
        <div className="header-logo">
          <a href="#home" className="logo-link">
            <GlobeIcon />
            <span className="logo-text">{t('app.title')}</span>
          </a>
        </div>

        <Navigation />

        <div className="header-actions">
          <LanguageSelector />
        </div>
      </div>
    </header>
  );
}

function GlobeIcon() {
  return (
    <svg
      className="logo-icon"
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

export default Header;
