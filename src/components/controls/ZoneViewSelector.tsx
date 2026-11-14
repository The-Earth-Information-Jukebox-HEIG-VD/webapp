import { useTranslation } from 'react-i18next';
import type { ZoneViewType } from '../../types/zones';

const ZONE_VIEW_OPTIONS: { type: ZoneViewType; labelKey: string }[] = [
  { type: 'continent', labelKey: 'zones.continents' },
  { type: 'country', labelKey: 'zones.countries' },
  { type: 'water', labelKey: 'zones.waterBodies' },
];

interface ZoneViewSelectorProps {
  value: ZoneViewType;
  onChange: (view: ZoneViewType) => void;
}

/**
 * Continents / Countries / Oceans & seas selector.
 * An accessible group of toggle buttons (aria-pressed); every option is a
 * Tab stop and activates with Enter or Space.
 */
export function ZoneViewSelector({ value, onChange }: ZoneViewSelectorProps) {
  const { t } = useTranslation();

  return (
    <div className="zone-view-toggle" role="group" aria-label={t('zones.viewType')}>
      {ZONE_VIEW_OPTIONS.map(({ type, labelKey }) => (
        <button
          key={type}
          type="button"
          className={`zone-toggle-button ${value === type ? 'active' : ''}`}
          onClick={() => onChange(type)}
          aria-pressed={value === type}
        >
          {t(labelKey)}
        </button>
      ))}
    </div>
  );
}

export default ZoneViewSelector;
