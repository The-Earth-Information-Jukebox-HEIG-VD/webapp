import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import './ThemeToggle.css';

/**
 * Light / dark switch in the header. A native toggle button: its name stays
 * "Dark mode" and aria-pressed says whether dark is on. The icon shows the
 * theme that is on (moon = dark, sun = light). Changing it is also announced
 * politely (only after a user action, not on page load).
 */
export function ThemeToggle() {
  const { t } = useTranslation();
  const { resolvedTheme, toggle } = useTheme();
  const [announcement, setAnnouncement] = useState('');
  const isDark = resolvedTheme === 'dark';

  const handleClick = () => {
    toggle();
    setAnnouncement(t(isDark ? 'theme.lightOn' : 'theme.darkOn'));
  };

  return (
    <>
      <button
        type="button"
        className="theme-toggle"
        aria-pressed={isDark}
        aria-label={t('theme.darkMode')}
        onClick={handleClick}
      >
        {isDark ? <MoonIcon /> : <SunIcon />}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
    </>
  );
}

function SunIcon() {
  return (
    <svg
      className="theme-toggle-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      className="theme-toggle-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export default ThemeToggle;
