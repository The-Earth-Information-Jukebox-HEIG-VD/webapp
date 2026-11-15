import { useTranslation } from 'react-i18next';
import type { ExperienceMode } from '../../contexts/ExperienceModeContext';
import './ExperienceModeSwitch.css';

const OPTIONS: { mode: ExperienceMode; icon: string }[] = [
  { mode: 'zones', icon: '⏳' },
  { mode: 'vinyl', icon: '💿' },
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
