import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { VINYL_PRESETS, presetForCenter } from '../../data/vinylPresets';
import { monthName } from '../../utils/formatDate';
import type { LatLng } from '../../utils/vinylGeometry';
import type { VinylPeriodRange, VinylStep, VinylTravel } from '../../hooks/useVinylSettings';
import './VinylControls.css';

interface VinylControlsProps {
  center: LatLng;
  onCenterChange: (c: LatLng) => void;
  /** "YYYY-MM" */
  timePeriod: string;
  onTimePeriodChange: (period: string) => void;
  range: VinylPeriodRange;
  /** The chosen month was moved to fit the selected sounds */
  clamped: boolean;
  /** What the needle travels through */
  travel: VinylTravel;
  onTravelChange: (travel: VinylTravel) => void;
  /** Travel 'both': how far the date moves per groove */
  step: VinylStep;
  onStepChange: (step: VinylStep) => void;
}

const TRAVELS: VinylTravel[] = ['space', 'time', 'both'];
const STEPS: VinylStep[] = ['month', 'year'];

type Field = 'lat' | 'lng';

function parsePeriod(p: string) {
  return { year: Number(p.slice(0, 4)), month: Number(p.slice(5, 7)) };
}

function toPeriod(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fmt(n: number) {
  return String(Math.round(n * 10) / 10);
}

/**
 * Vinyl settings: the month the record plays and its centre (preset, or exact
 * latitude/longitude; a click on the globe sets it too). All three stay in sync.
 */
export function VinylControls({
  center,
  onCenterChange,
  timePeriod,
  onTimePeriodChange,
  range,
  clamped,
  travel,
  onTravelChange,
  step,
  onStepChange,
}: VinylControlsProps) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const locale = i18n.language;

  // ---- Date --------------------------------------------------------------
  const { year, month } = parsePeriod(timePeriod);
  const start = parsePeriod(range.start);
  const end = parsePeriod(range.end);
  const years = useMemo(() => {
    const out: number[] = [];
    for (let y = end.year; y >= start.year; y--) out.push(y);
    return out;
  }, [start.year, end.year]);
  const monthAllowed = (y: number, m: number) => {
    const p = toPeriod(y, m);
    return p >= range.start && p <= range.end;
  };
  const changeYear = (y: number) => {
    // Keep the month when possible, otherwise the nearest month with data
    let m = month;
    if (!monthAllowed(y, m)) m = y === start.year ? start.month : end.month;
    onTimePeriodChange(toPeriod(y, m));
  };

  // ---- Place -------------------------------------------------------------
  const preset = presetForCenter(center);
  const [draft, setDraft] = useState({ lat: fmt(center.lat), lng: fmt(center.lng) });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});

  // A preset or a click on the globe moved the centre: show it in the fields
  useEffect(() => {
    setDraft({ lat: fmt(center.lat), lng: fmt(center.lng) });
    setErrors({});
  }, [center.lat, center.lng]);

  const validate = (field: Field, raw: string): string | null => {
    if (raw.trim() === '') return t('vinyl.errors.required');
    const n = Number(raw.replace(',', '.'));
    if (!Number.isFinite(n)) return t('vinyl.errors.notNumber');
    if (field === 'lat' && Math.abs(n) > 90) return t('vinyl.errors.latRange');
    if (field === 'lng' && Math.abs(n) > 180) return t('vinyl.errors.lngRange');
    return null;
  };

  const commit = (e?: FormEvent) => {
    e?.preventDefault();
    const next: Partial<Record<Field, string>> = {};
    for (const f of ['lat', 'lng'] as Field[]) {
      const err = validate(f, draft[f]);
      if (err) next[f] = err;
    }
    setErrors(next);
    if (next.lat || next.lng) return;
    const lat = Number(draft.lat.replace(',', '.'));
    const lng = Number(draft.lng.replace(',', '.'));
    if (Math.abs(lat - center.lat) < 1e-9 && Math.abs(lng - center.lng) < 1e-9) return;
    onCenterChange({ lat, lng });
  };

  const field = (f: Field) => {
    const inputId = `${id}-${f}`;
    const errId = `${inputId}-error`;
    const hintId = `${inputId}-hint`;
    return (
      <div className="vinyl-field">
        <label htmlFor={inputId}>{t(`vinyl.${f}`)}</label>
        <input
          id={inputId}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={draft[f]}
          aria-invalid={errors[f] ? true : undefined}
          aria-describedby={errors[f] ? `${hintId} ${errId}` : hintId}
          onChange={(e) => setDraft((d) => ({ ...d, [f]: e.target.value }))}
          onBlur={() => commit()}
        />
        <span id={hintId} className="vinyl-hint">
          {t(`vinyl.${f}Hint`)}
        </span>
        {errors[f] && (
          <span id={errId} className="vinyl-error">
            {errors[f]}
          </span>
        )}
      </div>
    );
  };

  return (
    <form className="vinyl-controls" onSubmit={commit} noValidate>
      <fieldset className="vinyl-group">
        <legend>{t(travel === 'space' ? 'vinyl.date' : 'vinyl.dateFrom')}</legend>
        <div className="vinyl-row">
          <div className="vinyl-field">
            <label htmlFor={`${id}-month`}>{t('vinyl.month')}</label>
            <select
              id={`${id}-month`}
              value={month}
              aria-describedby={`${id}-date-hint`}
              onChange={(e) => onTimePeriodChange(toPeriod(year, Number(e.target.value)))}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m} disabled={!monthAllowed(year, m)}>
                  {monthName(m, locale)}
                </option>
              ))}
            </select>
          </div>
          <div className="vinyl-field">
            <label htmlFor={`${id}-year`}>{t('vinyl.year')}</label>
            <select
              id={`${id}-year`}
              value={year}
              aria-describedby={`${id}-date-hint`}
              onChange={(e) => changeYear(Number(e.target.value))}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p id={`${id}-date-hint`} className="vinyl-hint">
          {t(range.disjoint ? 'vinyl.dateDisjointHint' : 'vinyl.dateHint', {
            start: `${monthName(start.month, locale, 'short')} ${start.year}`,
            end: `${monthName(end.month, locale, 'short')} ${end.year}`,
          })}
          {clamped && ` ${t('vinyl.dateClamped')}`}
        </p>
      </fieldset>

      <fieldset className="vinyl-group vinyl-travel" aria-describedby={`${id}-restart`}>
        <legend>{t('vinyl.travel')}</legend>
        {TRAVELS.map((mode) => (
          <div key={mode} className="vinyl-radio">
            <input
              type="radio"
              id={`${id}-travel-${mode}`}
              name={`${id}-travel`}
              value={mode}
              checked={travel === mode}
              aria-describedby={`${id}-travel-${mode}-hint`}
              onChange={() => onTravelChange(mode)}
            />
            {/* The hint is the description, not part of the name: kept out of the label */}
            <div className="vinyl-radio-text">
              <label htmlFor={`${id}-travel-${mode}`} className="vinyl-radio-name">
                {t(`vinyl.travel${cap(mode)}`)}
              </label>
              <span id={`${id}-travel-${mode}-hint`} className="vinyl-hint">
                {t(`vinyl.travel${cap(mode)}Hint`)}
              </span>
            </div>
          </div>
        ))}
        {travel === 'both' && (
          <div className="vinyl-field">
            <label htmlFor={`${id}-step`}>{t('vinyl.step')}</label>
            <select id={`${id}-step`} value={step} onChange={(e) => onStepChange(e.target.value as VinylStep)}>
              {STEPS.map((x) => (
                <option key={x} value={x}>
                  {t(`vinyl.step${cap(x)}`)}
                </option>
              ))}
            </select>
          </div>
        )}
      </fieldset>

      <fieldset className="vinyl-group">
        <legend>{t('vinyl.place')}</legend>
        <div className="vinyl-row">
          <div className="vinyl-field vinyl-field-wide">
            <label htmlFor={`${id}-preset`}>{t('vinyl.preset')}</label>
            <select
              id={`${id}-preset`}
              value={preset?.id ?? 'custom'}
              onChange={(e) => {
                const p = VINYL_PRESETS.find((x) => x.id === e.target.value);
                if (p) onCenterChange(p.center);
              }}
            >
              {!preset && <option value="custom">{t('vinyl.presetCustom')}</option>}
              {VINYL_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {t(`vinyl.presets.${p.id}`)}
                </option>
              ))}
            </select>
          </div>
          {field('lat')}
          {field('lng')}
          <button type="submit" className="vinyl-apply">
            {t('vinyl.apply')}
          </button>
        </div>
        <p className="vinyl-hint">{t('vinyl.pickHint')}</p>
      </fieldset>
      <p id={`${id}-restart`} className="vinyl-hint vinyl-restart">{t('vinyl.restartHint')}</p>
    </form>
  );
}

export default VinylControls;
