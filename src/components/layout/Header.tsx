import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useCompactOnScroll } from '../../hooks/useCompactOnScroll';
import { Navigation } from './Navigation';
import { LanguageSelector } from '../controls/LanguageSelector';
import { ThemeToggle } from './ThemeToggle';
import { SpinningLogo } from './SpinningLogo';
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
            <SpinningLogo src="/logo-96" size={40} imgClassName="logo-icon" />
            <span className="logo-text">{t('app.title')}</span>
          </a>
        </div>

        <Navigation />

        <div className="header-actions">
          <ThemeToggle />
          <LanguageSelector />
        </div>
      </div>
    </header>
  );
}

export default Header;
