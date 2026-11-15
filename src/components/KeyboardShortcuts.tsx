import { useEffect, useRef, useCallback } from 'react';
import './KeyboardShortcuts.css';

interface KeyboardShortcutsProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Shortcut {
  keys: string[];
  description: string;
}

const shortcuts: Shortcut[] = [
  { keys: ['Space'], description: 'Play or pause sonification' },
  { keys: ['←', '→'], description: 'Seek backward or forward 2%' },
  { keys: ['Shift', '←'], description: 'On the timeline: back 1 month' },
  { keys: ['Shift', '→'], description: 'On the timeline: forward 1 month' },
  { keys: ['Page Up'], description: 'On the timeline: forward 1 year' },
  { keys: ['Page Down'], description: 'On the timeline: back 1 year' },
  { keys: ['M'], description: 'Mute or unmute' },
  { keys: ['Home'], description: 'Jump to beginning' },
  { keys: ['End'], description: 'Jump to end' },
  { keys: ['Tab'], description: 'Navigate between controls' },
  { keys: ['Shift', 'Tab'], description: 'Navigate backward' },
  { keys: ['Enter'], description: 'Activate focused control' },
  { keys: ['Esc'], description: 'Close dialogs and menus' },
  { keys: ['?'], description: 'Open keyboard shortcuts help' },
];

/**
 * KeyboardShortcuts - Accessible modal showing available keyboard shortcuts
 *
 * Implements proper focus trap and keyboard handling for modal dialogs.
 */
export function KeyboardShortcuts({ isOpen, onClose }: KeyboardShortcutsProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Focus trap and keyboard handling
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      // Focus trap - cycle focus within modal
      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      // Focus the close button when modal opens
      closeButtonRef.current?.focus();
      // Prevent body scroll
      document.body.style.overflow = 'hidden';

      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = '';
      };
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      className="keyboard-shortcuts-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        className="keyboard-shortcuts-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        aria-describedby="shortcuts-description"
      >
        <header className="shortcuts-header">
          <h2 id="shortcuts-title">Keyboard Shortcuts</h2>
          <button
            ref={closeButtonRef}
            className="shortcuts-close"
            onClick={onClose}
            aria-label="Close keyboard shortcuts"
          >
            <CloseIcon />
          </button>
        </header>

        <p id="shortcuts-description" className="shortcuts-intro">
          Use these keyboard shortcuts to control the sonification player and
          navigate the application.
        </p>

        <div className="shortcuts-list" role="list">
          {shortcuts.map((shortcut, index) => (
            <div key={index} className="shortcut-item" role="listitem">
              <div className="shortcut-keys" aria-hidden="true">
                {shortcut.keys.map((key, keyIndex) => (
                  <span key={keyIndex}>
                    <kbd className="shortcut-key">{key}</kbd>
                    {keyIndex < shortcut.keys.length - 1 && (
                      <span className="key-separator">+</span>
                    )}
                  </span>
                ))}
              </div>
              <span className="shortcut-description">
                <span className="sr-only">
                  {shortcut.keys.join(' plus ')}:
                </span>
                {shortcut.description}
              </span>
            </div>
          ))}
        </div>

        <footer className="shortcuts-footer">
          <p>
            Press <kbd>?</kbd> anytime to show this help.
          </p>
        </footer>
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
    </svg>
  );
}

export default KeyboardShortcuts;
