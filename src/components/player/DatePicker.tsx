import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatMonthYear, monthName, splitFractionalYear } from '../../utils/formatDate';
import './DatePicker.css';

interface DatePickerProps {
  /** Current position as a fractional year */
  position: number;
  yearRange: { start: number; end: number };
  /** Fractional year just after the last data month */
  timelineEnd: number;
  onSeekToYear: (fractionalYear: number) => void;
}

/**
 * Year + month picker in a non-modal popover opened from the date badge.
 */
export function DatePicker({ position, yearRange, timelineEnd, onSeekToYear }: DatePickerProps) {
  const { t, i18n } = useTranslation('player');
  const locale = i18n.language;
  const uid = useId();
  const titleId = `${uid}-title`;
  const yearId = `${uid}-year`;
  const monthId = `${uid}-month`;

  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(yearRange.start);
  const [month, setMonth] = useState(1);
  const [announcement, setAnnouncement] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const yearRef = useRef<HTMLSelectElement>(null);

  // Last month holding data
  const last = useMemo(
    () => splitFractionalYear(Math.max(yearRange.start, timelineEnd - 1 / 12)),
    [timelineEnd, yearRange.start]
  );

  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = yearRange.start; y <= yearRange.end; y++) list.push(y);
    return list;
  }, [yearRange.start, yearRange.end]);

  const isMonthDisabled = useCallback(
    (m: number, y: number) => y === last.year && m > last.month,
    [last]
  );

  const short = formatMonthYear(position, locale, 'short');

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  const toggle = () => {
    if (open) {
      close(false);
      return;
    }
    const { year: y, month: m } = splitFractionalYear(position);
    setYear(Math.min(yearRange.end, Math.max(yearRange.start, y)));
    setMonth(m);
    setOpen(true);
  };

  useEffect(() => {
    if (open) yearRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && e.target instanceof Node && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  const handleYearChange = (y: number) => {
    setYear(y);
    if (isMonthDisabled(month, y)) setMonth(last.month);
  };

  const handleGo = (e: React.FormEvent) => {
    e.preventDefault();
    const target = year + (month - 1) / 12;
    onSeekToYear(target);
    // Focus returns to the trigger before the position updates: say where we went
    setAnnouncement('');
    window.setTimeout(
      () => setAnnouncement(t('datePicker.jumped', { date: formatMonthYear(target, locale, 'long') })),
      50
    );
    close(true);
  };

  return (
    <div
      className="date-picker"
      ref={rootRef}
      onBlur={(e) => {
        // Non-modal: Tabbing out of the popover closes it (focus already moved on)
        const next = e.relatedTarget;
        if (open && next instanceof Node && !e.currentTarget.contains(next)) setOpen(false);
      }}
    >
      <button
        type="button"
        ref={triggerRef}
        className="date-picker-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t('datePicker.open', { date: short })}
        onClick={toggle}
      >
        <span aria-hidden="true">{short}</span>
      </button>

      <div className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </div>

      {open && (
        <div
          className="date-picker-popover"
          role="dialog"
          aria-labelledby={titleId}
        >
          <form onSubmit={handleGo}>
            <h2 id={titleId} className="date-picker-title">
              {t('datePicker.title')}
            </h2>
            <div className="date-picker-fields">
              <div className="date-picker-field">
                <label htmlFor={yearId}>{t('datePicker.year')}</label>
                <select
                  id={yearId}
                  ref={yearRef}
                  value={year}
                  onChange={(e) => handleYearChange(Number(e.target.value))}
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              <div className="date-picker-field">
                <label htmlFor={monthId}>{t('datePicker.month')}</label>
                <select
                  id={monthId}
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m} disabled={isMonthDisabled(m, year)}>
                      {monthName(m, locale, 'long')}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="date-picker-actions">
              <button type="button" className="date-picker-close" onClick={() => close(true)}>
                {t('datePicker.close')}
              </button>
              <button type="submit" className="date-picker-go">
                {t('datePicker.go')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default DatePicker;
