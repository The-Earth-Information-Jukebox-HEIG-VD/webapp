import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Genre } from '../../services/sonificationApi';
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
 * description is its hint (aria-describedby); a change is announced politely
 * ("Music style: Funk"). Global player shortcuts ignore the select
 * (usePlayerShortcuts), so arrows and letters pick options.
 */
export function StyleSelector({ genres, value, onChange }: StyleSelectorProps) {
  const { t } = useTranslation();
  const id = useId();
  const [announcement, setAnnouncement] = useState('');
  const selected = genres.find((g) => g.id === value);
  // Announce only changes made by the user, not the first value
  const changed = useRef(false);
  useEffect(() => {
    if (changed.current && selected) setAnnouncement(t('style.changed', { name: selected.name }));
  }, [selected, t]);

  if (genres.length === 0) return null;

  return (
    <div className="style-selector">
      <label htmlFor={`${id}-select`} className="style-selector-label">
        {t('style.label')}
      </label>
      <select
        id={`${id}-select`}
        className="style-selector-select"
        value={selected?.id ?? ''}
        aria-describedby={selected ? `${id}-hint` : undefined}
        onChange={(e) => {
          changed.current = true;
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
        <p id={`${id}-hint`} className="style-selector-hint">
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
