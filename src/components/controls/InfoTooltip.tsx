import { useState, useRef, useEffect, useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import './InfoTooltip.css';

interface InfoTooltipProps {
  children: ReactNode;
  /** Accessible name of the (i) button; defaults to "More information" */
  label?: string;
  /** Where the bubble opens: centred under the icon, or aligned to its right edge (near the screen edge) */
  align?: 'center' | 'end';
}

/**
 * (i) button that shows extra text on hover, focus or click.
 *
 * WCAG 1.4.13: the bubble stays open while the pointer is over it (hoverable),
 * Escape closes it (dismissible), and it stays until the pointer or focus leaves.
 * Screen readers get the text as the button's description (aria-describedby).
 */
export function InfoTooltip({ children, label, align = 'center' }: InfoTooltipProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipId = useId();

  // Close on a click outside, or on Escape anywhere
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Only this bubble closes: the globe's Escape (back to zone selection) must not fire too
        e.stopPropagation();
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey, true);
    };
  }, [isOpen]);

  return (
    <div
      ref={containerRef}
      className="info-tooltip-container"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        type="button"
        className="info-tooltip-trigger"
        onClick={() => setIsOpen(!isOpen)}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        aria-describedby={tooltipId}
        aria-label={label ?? t('viewMode.moreInfo')}
      >
        <InfoIcon />
      </button>

      <div
        id={tooltipId}
        className={`info-tooltip-content${align === 'end' ? ' align-end' : ''}${isOpen ? ' visible' : ''}`}
        role="tooltip"
      >
        <div className="info-tooltip-body">{children}</div>
      </div>
    </div>
  );
}

function InfoIcon() {
  return (
    <svg
      className="info-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

export default InfoTooltip;
