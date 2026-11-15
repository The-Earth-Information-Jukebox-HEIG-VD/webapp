import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ExperienceMode } from '../../contexts/ExperienceModeContext';
import './ExperienceModeSwitch.css';

const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
} as const;

function HourglassIcon() {
  return (
    <svg {...iconProps}>
      <path d="M6 2h12M6 22h12" />
      <path d="M7 2v4a5 5 0 0 0 2 4l3 2-3 2a5 5 0 0 0-2 4v4" />
      <path d="M17 2v4a5 5 0 0 1-2 4l-3 2 3 2a5 5 0 0 1 2 4v4" />
    </svg>
  );
}

function RecordIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.5" />
    </svg>
  );
}

const OPTIONS: { mode: ExperienceMode; icon: ReactNode }[] = [
  { mode: 'zones', icon: <HourglassIcon /> },
  { mode: 'vinyl', icon: <RecordIcon /> },
];

interface ExperienceModeSwitchProps {
  value: ExperienceMode;
  onChange: (mode: ExperienceMode) => void;
}

/**
 * Choice between the two experiences: "Time travel" (a zone through the years)
 * and "Vinyl" (one month across the globe). An accessible group of toggle
 * buttons (aria-pressed), each with a short visible description.
 */
export function ExperienceModeSwitch({ value, onChange }: ExperienceModeSwitchProps) {
  const { t } = useTranslation();

  return (
    <div className="experience-switch" role="group" aria-labelledby="experience-switch-label">
      <span id="experience-switch-label" className="experience-switch-label">
        {t('experience.label')}
      </span>
      <div className="experience-switch-options">
        {OPTIONS.map(({ mode, icon }) => (
          <button
            key={mode}
            type="button"
            className={`experience-option ${value === mode ? 'active' : ''}`}
            aria-pressed={value === mode}
            aria-describedby={`experience-${mode}-hint`}
            onClick={() => value !== mode && onChange(mode)}
          >
            <span className="experience-option-icon" aria-hidden="true">
              {icon}
            </span>
            <span className="experience-option-text">
              <span className="experience-option-title">{t(`experience.${mode}`)}</span>
              <span id={`experience-${mode}-hint`} className="experience-option-hint">
                {t(`experience.${mode}Hint`)}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default ExperienceModeSwitch;
