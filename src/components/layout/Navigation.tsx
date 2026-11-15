import { useTranslation } from 'react-i18next';
import { useHashRoute } from '../../hooks/useHashRoute';
import './Navigation.css';

/**
 * Main navigation component
 *
 * Single-page navigation using anchor links to sections.
 * Supports keyboard navigation and screen readers.
 */
export function Navigation() {
  const { t } = useTranslation();
  const route = useHashRoute();

  const navItems = [
    { id: 'home', href: '#home', label: t('nav.home') },
    { id: 'howto', href: '#how-to-use', label: t('nav.howTo') },
    { id: 'about', href: '#about', label: t('nav.about') },
  ];

  return (
    <nav className="navigation" role="navigation" aria-label="Main navigation">
      <ul className="nav-list">
        {navItems.map((item) => (
          <li key={item.id} className="nav-item">
            <a
              href={item.href}
              className={`nav-link ${route === item.id ? 'active' : ''}`}
              aria-current={route === item.id ? 'page' : undefined}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default Navigation;
