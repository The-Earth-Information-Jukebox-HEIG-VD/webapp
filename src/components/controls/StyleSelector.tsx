import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Genre } from '../../services/sonificationApi';
import { InfoTooltip } from './InfoTooltip';
import './StyleSelector.css';

interface StyleSelectorProps {
  /** Styles from GET /api/genres (empty while unknown: nothing is shown) */
  genres: Genre[];
  /** Selected style id */
  value: string | undefined;
  onChange: (id: string) => void;
}

/**
 * "Music style" select, shared by zone and vinyl mode. The selected style's
 * description is in an (i) tooltip next to the label, and also the select's
 * description for screen readers (aria-describedby); a change is announced politely
 * ("Music style: Funk"). Global player shortcuts ignore the select
 * (usePlayerShortcuts), so arrows and letters pick options.
 */
export function StyleSelector({ genres, value, onChange }: StyleSelectorProps) {
  const { t } = useTranslation();
  const id = useId();
  const [announcement, setAnnouncement] = useState('');
  const selected = genres.find((g) => g.id === value);
  if (genres.length === 0) return null;

  return (
    <div className="style-selector">
      <div className="style-selector-label-row">
        <label htmlFor={`${id}-select`} className="style-selector-label">
          {t('style.label')}
        </label>
        {selected && (
          <InfoTooltip label={t('style.infoLabel')}>
            <p>{t('style.hint', { description: selected.description })}</p>
          </InfoTooltip>
        )}
      </div>
      <select
        id={`${id}-select`}
        className="style-selector-select"
        value={selected?.id ?? ''}
        aria-describedby={selected ? `${id}-hint` : undefined}
        onChange={(e) => {
          // Announced here (a user choice), not in an effect: a reloaded list or a
          // restored saved style must not be announced again
          const picked = genres.find((g) => g.id === e.target.value);
          if (picked) setAnnouncement(t('style.changed', { name: picked.name }));
          onChange(e.target.value);
        }}
      >
        {genres.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
      {selected && (
        <p id={`${id}-hint`} className="sr-only">
          {t('style.hint', { description: selected.description })}
        </p>
      )}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
    </div>
  );
}

export default StyleSelector;
