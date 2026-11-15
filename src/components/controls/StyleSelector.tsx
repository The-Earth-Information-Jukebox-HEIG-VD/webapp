import { useId, useMemo, useState } from 'react';
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
 * The styles the team worked on most, in display order: they carry the data's
 * message most clearly (the orchestra, and the sound of each phenomenon). The
 * other styles stay available "just for fun".
 */
export const RECOMMENDED_STYLES = ['orchestra', 'realistic'];

/** Recommended styles first (in RECOMMENDED_STYLES order), then the others in server order. */
export function groupGenres(genres: Genre[]): { recommended: Genre[]; fun: Genre[] } {
  const recommended = RECOMMENDED_STYLES.flatMap((id) => genres.filter((g) => g.id === id));
  const fun = genres.filter((g) => !RECOMMENDED_STYLES.includes(g.id));
  return { recommended, fun };
}

/**
 * "Music style" select, shared by zone and vinyl mode. The recommended styles
 * come first in their own <optgroup>, the others under "Just for fun"; the (i)
 * tooltip next to the label says why (also the select's description). The selected style's
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
  const { recommended, fun } = useMemo(() => groupGenres(genres), [genres]);
  if (genres.length === 0) return null;
  // Groups only make sense when the server offers a recommended style and others
  const grouped = recommended.length > 0 && fun.length > 0;
  const isFun = grouped && selected !== undefined && !RECOMMENDED_STYLES.includes(selected.id);
  const note = grouped
    ? `${t('style.recommendedNote', { names: recommended.map((g) => g.name).join(t('style.and')) })}${
        isFun ? ` ${t('style.funNote')}` : ''
      }`
    : '';
  const option = (g: Genre) => (
    <option key={g.id} value={g.id}>
      {g.name}
    </option>
  );

  return (
    <div className="style-selector">
      <div className="style-selector-label-row">
        <label htmlFor={`${id}-select`} className="style-selector-label">
          {t('style.label')}
        </label>
        {(selected || grouped) && (
          <InfoTooltip label={t('style.infoLabel')}>
            {grouped && <p>{note}</p>}
            {selected && <p>{t('style.hint', { description: selected.description })}</p>}
          </InfoTooltip>
        )}
      </div>
      <select
        id={`${id}-select`}
        className="style-selector-select"
        value={selected?.id ?? ''}
        aria-describedby={
          [grouped ? `${id}-note` : '', selected ? `${id}-hint` : ''].filter(Boolean).join(' ') || undefined
        }
        onChange={(e) => {
          // Announced here (a user choice), not in an effect: a reloaded list or a
          // restored saved style must not be announced again
          const picked = genres.find((g) => g.id === e.target.value);
          if (picked) setAnnouncement(t('style.changed', { name: picked.name }));
          onChange(e.target.value);
        }}
      >
        {grouped ? (
          <>
            <optgroup label={t('style.recommendedGroup')}>{recommended.map(option)}</optgroup>
            <optgroup label={t('style.funGroup')}>{fun.map(option)}</optgroup>
          </>
        ) : (
          genres.map(option)
        )}
      </select>
      {/* The (i) bubble shows the note on hover/focus; the select also carries it as its description */}
      {grouped && (
        <p id={`${id}-note`} className="sr-only">
          {note}
        </p>
      )}
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
