import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { supportedLanguages, languageNames, type SupportedLanguage } from '../../i18n';
import './LanguageSelector.css';

/**
 * Language selector dropdown component
 *
 * Allows users to switch between supported languages (EN, FR, DE).
 * Accessible with keyboard navigation and screen reader support.
 */
export function LanguageSelector() {
  const { t, i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const currentLanguage = i18n.language.split('-')[0] as SupportedLanguage;

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const handleSelect = useCallback(
    (lang: SupportedLanguage) => {
      i18n.changeLanguage(lang);
      setIsOpen(false);
      buttonRef.current?.focus();
    },
    [i18n]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'Escape':
          setIsOpen(false);
          buttonRef.current?.focus();
          break;
        case 'ArrowDown': {
          e.preventDefault();
          // Focus next item
          const items = containerRef.current?.querySelectorAll('[role="menuitem"]');
          const currentIndex = Array.from(items || []).findIndex(
            (item) => item === document.activeElement
          );
          const nextIndex = currentIndex < (items?.length || 0) - 1 ? currentIndex + 1 : 0;
          (items?.[nextIndex] as HTMLElement)?.focus();
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          // Focus previous item
          const itemsUp = containerRef.current?.querySelectorAll('[role="menuitem"]');
          const currentIndexUp = Array.from(itemsUp || []).findIndex(
            (item) => item === document.activeElement
          );
          const prevIndex = currentIndexUp > 0 ? currentIndexUp - 1 : (itemsUp?.length || 1) - 1;
          (itemsUp?.[prevIndex] as HTMLElement)?.focus();
          break;
        }
      }
    },
    [isOpen]
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      ref={containerRef}
      className="language-selector"
      role="group"
      onKeyDown={handleKeyDown}
    >
      <button
        ref={buttonRef}
        type="button"
        className="language-button"
        onClick={handleToggle}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={`${t('language.select')}: ${languageNames[currentLanguage]}`}
      >
        <LanguageIcon />
        <span className="language-code">{currentLanguage.toUpperCase()}</span>
        <ChevronIcon isOpen={isOpen} />
      </button>

      {isOpen && (
        <ul
          className="language-menu"
          role="menu"
          aria-label={t('language.select')}
        >
          {supportedLanguages.map((lang) => (
            <li key={lang} role="none">
              <button
                type="button"
                role="menuitem"
                className={`language-option ${lang === currentLanguage ? 'active' : ''}`}
                onClick={() => handleSelect(lang)}
                aria-current={lang === currentLanguage ? 'true' : undefined}
              >
                <span className="language-option-code">{lang.toUpperCase()}</span>
                <span className="language-option-name">{languageNames[lang]}</span>
                {lang === currentLanguage && <CheckIcon />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LanguageIcon() {
  return (
    <svg
      className="language-icon"
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

function ChevronIcon({ isOpen }: { isOpen: boolean }) {
  return (
    <svg
      className={`chevron-icon ${isOpen ? 'open' : ''}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="check-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default LanguageSelector;
