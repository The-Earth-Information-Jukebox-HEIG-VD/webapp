import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { monthName } from '../../utils/formatDate';
import './MonthTravelControl.css';

interface MonthTravelControlProps {
  /** 1..12 = only that month, through the years; null = every month */
  month: number | null;
  onChange: (month: number | null) => void;
  /** Years the timeline covers, for the hint ("Each July, 1880–2025") */
  yearRange: { start: number; end: number };
}

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/**
 * Month travel: play every month (default), or one month through the years
 * (each July from 1880 to 2025). A single native <select>: keyboard and screen
 * readers get the standard behaviour, and it fits the player bar on phones.
 * The visible hint states what is playing; the global player shortcuts ignore
 * `select`, so arrow keys stay inside it.
 */
export function MonthTravelControl({ month, onChange, yearRange }: MonthTravelControlProps) {
  const { t, i18n } = useTranslation('player');
  const locale = i18n.language;
  const id = useId();
  const selectId = `${id}-select`;
  const hintId = `${id}-hint`;

  return (
    <div className={`month-travel${month ? ' active' : ''}`}>
      <label className="month-travel-label" htmlFor={selectId}>
        {t('monthTravel.label')}
      </label>
      <select
        id={selectId}
        className="month-travel-select"
        value={month ?? ''}
        aria-describedby={hintId}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">{t('monthTravel.every')}</option>
        {MONTHS.map((m) => (
          <option key={m} value={m}>
            {t('monthTravel.only', { month: monthName(m, locale, 'long') })}
          </option>
        ))}
      </select>
      <span id={hintId} className={month ? 'month-travel-hint' : 'sr-only'}>
        {month
          ? t('monthTravel.hintActive', {
              month: monthName(month, locale, 'long'),
              start: yearRange.start,
              end: yearRange.end,
            })
          : t('monthTravel.hint')}
      </span>
    </div>
  );
}

export default MonthTravelControl;
