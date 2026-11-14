import { useState, useRef, useEffect, type ReactNode } from 'react';
import './InfoTooltip.css';

interface InfoTooltipProps {
  children: ReactNode;
}

/**
 * Info tooltip component with a question mark icon
 *
 * Shows additional context on hover/focus for sighted users
 * and provides the same content for screen readers.
 */
export function InfoTooltip({ children }: InfoTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipId = useRef(`tooltip-${Math.random().toString(36).slice(2, 9)}`);

  // Close tooltip when clicking outside
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
    <div ref={containerRef} className="info-tooltip-container">
      <button
        type="button"
        className="info-tooltip-trigger"
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        aria-describedby={tooltipId.current}
        aria-label="More information"
      >
        <InfoIcon />
      </button>

      <div
        id={tooltipId.current}
        className={`info-tooltip-content ${isOpen ? 'visible' : ''}`}
        role="tooltip"
        aria-hidden={!isOpen}
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
