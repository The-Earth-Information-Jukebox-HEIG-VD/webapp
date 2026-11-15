import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useCompactOnScroll } from '../../hooks/useCompactOnScroll';
import { Navigation } from './Navigation';
import { LanguageSelector } from '../controls/LanguageSelector';
import './Header.css';

/**
 * Header component with logo, navigation, and controls
 *
 * Contains the main navigation, language selector, and accessibility toggle.
 * Sticky at the top of the viewport; shrinks to a compact bar once the user
 * scrolls, to leave more room for the globe.
 */
export function Header() {
  const { t } = useTranslation();
  const compact = useCompactOnScroll();

  // Expose the state on <html> so --header-height (sticky offsets, scroll margins)
  // follows the header's actual height everywhere.
  useEffect(() => {
    const root = document.documentElement;
    root.toggleAttribute('data-header-compact', compact);
    return () => root.removeAttribute('data-header-compact');
  }, [compact]);

  return (
    <header className={compact ? 'header header--compact' : 'header'} role="banner">
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
