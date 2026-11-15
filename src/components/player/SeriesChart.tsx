import { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { ApiErrorKind, DatasetSeries } from '../../services/sonificationApi';
import type { ZoneSeriesStatus } from '../../hooks/useZoneSeries';
import { formatMonthYear, monthName, splitFractionalYear } from '../../utils/formatDate';
import { snapToMonth } from '../../services/sonificationApi';
import { formatReading, formatUnits } from '../../utils/reading';
import { buildTicks } from './Timeline';
import { usePlaybackPosition, type PositionStore } from '../../hooks/usePlaybackPosition';
import './SeriesChart.css';

export interface ChartLine {
  id: string;
  /** Translated dataset name */
  name: string;
  /** Track colour */
  color: string;
  series: DatasetSeries;
}

interface SeriesChartProps {
  lines: ChartLine[];
  status: ZoneSeriesStatus;
  errorKind?: ApiErrorKind | null;
  onRetry?: () => void;
  zoneName?: string | null;
  /** Same axis as the Timeline underneath */
  startYear: number;
  endYear: number;
  timelineEnd?: number;
  /** Playhead, as a fractional year */
  position: number;
  /** Hover position along the track (0..1), from the chart or the Timeline */
  hoverFraction: number | null;
  onHoverChange: (fraction: number | null) => void;
  /** Click on the plot: seek to this fraction (0..1) of the track */
  onSeek: (fraction: number) => void;
  /**
   * Month travel (1..12): one point per year at that month (each July), joined
   * across the years; the table, summary and legend read that month only.
   */
  month?: number | null;
}

// SVG user space (preserveAspectRatio="none": it stretches to the element)
export const VIEW_W = 1000;
export const VIEW_H = 100;
export const MARGIN_Y = 6;
const DASHES = ['', '6 3', '2 3', '8 3 2 3', '1 4', '12 4', '4 2 1 2'];
/** Fixed dash per known track id: the pattern follows the track, never its rank. */
const TRACK_DASH_INDEX: Record<string, number> = {
  temperature: 0,
  precipitation: 1,
  co2: 2,
  snow: 3,
  lightning: 4,
  night_lights: 5,
  fires: 6,
};

/** Dash pattern of a line: stable per id, whatever other lines are shown. */
export function dashFor(id: string): string | undefined {
  let idx = TRACK_DASH_INDEX[id];
  if (idx === undefined) {
    let h = 0;
    for (let k = 0; k < id.length; k++) h = (h * 31 + id.charCodeAt(k)) >>> 0;
    idx = h % DASHES.length;
  }
  return DASHES[idx] || undefined;
}

/** "YYYY-MM" -> fractional year ((year + (month-1)/12) as the Timeline computes it) */
function startToYear(start: string): number {
  const m = /^(\d{4})-(\d{1,2})/.exec(start);
  return m ? Number(m[1]) + (Number(m[2]) - 1) / 12 : NaN;
}

/** x in 0..VIEW_W, using the Timeline's formula: (year - startYear) / (timelineEnd - startYear) */
export function yearToX(year: number, startYear: number, edge: number): number {
  return ((year - startYear) / Math.max(1e-6, edge - startYear)) * VIEW_W;
}

export function seriesRange(values: (number | null)[]): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v === null || !Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return min === Infinity ? null : { min, max };
}

/** y in MARGIN_Y..VIEW_H-MARGIN_Y for a value, on the line's own min-max scale (high = up) */
export function valueToY(value: number, min: number, max: number): number {
  const inner = VIEW_H - 2 * MARGIN_Y;
  if (max === min) return MARGIN_Y + inner / 2;
  return MARGIN_Y + (1 - (value - min) / (max - min)) * inner;
}

/**
 * SVG path of one series. A null value starts a new sub-path (a gap);
 * yearly data is drawn as steps spanning each calendar year.
 */
export function buildLinePath(
  series: DatasetSeries,
  startYear: number,
  edge: number,
  range: { min: number; max: number } | null = seriesRange(series.values)
): string {
  const first = startToYear(series.start);
  if (!range || Number.isNaN(first)) return '';
  const f = (n: number) => n.toFixed(2);
  const parts: string[] = [];

  if (series.yearly) {
    // One value per calendar year: first non-null value found in that year
    const byYear = new Map<number, number>();
    series.values.forEach((v, i) => {
      if (v === null || !Number.isFinite(v)) return;
      const year = Math.floor(first + i / 12 + 1e-9);
      if (!byYear.has(year)) byYear.set(year, v);
    });
    let prevEnd: number | null = null;
    for (const year of [...byYear.keys()].sort((a, b) => a - b)) {
      const y = valueToY(byYear.get(year)!, range.min, range.max);
      const x0 = yearToX(year, startYear, edge);
      const x1 = yearToX(year + 1, startYear, edge);
      parts.push(`${prevEnd === year ? 'L' : 'M'}${f(x0)} ${f(y)}L${f(x1)} ${f(y)}`);
      prevEnd = year + 1;
    }
    return parts.join('');
  }

  let open = false;
  series.values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      open = false;
      return;
    }
    const x = yearToX(first + i / 12, startYear, edge);
    parts.push(`${open ? 'L' : 'M'}${f(x)} ${f(valueToY(v, range.min, range.max))}`);
    open = true;
  });
  return parts.join('');
}

/**
 * Isolated single-month values (both neighbours null) would be zero-length sub-paths,
 * which draw nothing. They get a tiny segment with round caps instead, so they stay visible.
 * Yearly data is drawn as steps, which always have a width.
 */
export function buildDotsPath(
  series: DatasetSeries,
  startYear: number,
  edge: number,
  range: { min: number; max: number } | null = seriesRange(series.values)
): string {
  const first = startToYear(series.start);
  if (!range || Number.isNaN(first) || series.yearly) return '';
  const valid = (v: number | null | undefined): v is number =>
    v !== null && v !== undefined && Number.isFinite(v);
  const parts: string[] = [];
  series.values.forEach((v, i) => {
    if (!valid(v) || valid(series.values[i - 1]) || valid(series.values[i + 1])) return;
    const x = yearToX(first + i / 12, startYear, edge);
    parts.push(`M${x.toFixed(2)} ${valueToY(v, range.min, range.max).toFixed(2)}h0.01`);
  });
  return parts.join('');
}

/** Value of a series at a fractional year, or null (no data / outside the series). */
export function valueAtYear(series: DatasetSeries, year: number): number | null {
  const first = startToYear(series.start);
  if (Number.isNaN(first)) return null;
  const { year: y, month } = splitFractionalYear(year);
  const idx = Math.round((y + (month - 1) / 12 - first) * 12);
  if (idx < 0 || idx >= series.values.length) return null;
  if (series.yearly) {
    // Whichever month of this year carries the value
    const jan = idx - (month - 1);
    for (let i = Math.max(0, jan); i < Math.min(series.values.length, jan + 12); i++) {
      const v = series.values[i];
      if (v !== null && Number.isFinite(v)) return v;
    }
    return null;
  }
  const v = series.values[idx];
  return v !== null && Number.isFinite(v) ? v : null;
}

/** Yearly mean of the non-null values, per calendar year. */
export function yearlyMeans(series: DatasetSeries): Map<number, number> {
  const first = startToYear(series.start);
  const sums = new Map<number, { sum: number; n: number }>();
  if (Number.isNaN(first)) return new Map();
  series.values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) return;
    const year = Math.floor(first + i / 12 + 1e-9);
    const acc = sums.get(year) ?? { sum: 0, n: 0 };
    acc.sum += v;
    acc.n += 1;
    sums.set(year, acc);
  });
  return new Map([...sums].map(([year, { sum, n }]) => [year, sum / n]));
}

/**
 * Month travel: the value of `month` (1..12) in each year, by year. Yearly data
 * (night lights) has one value per year: that value stands for every month.
 */
export function monthValues(series: DatasetSeries, month: number): Map<number, number> {
  const first = startToYear(series.start);
  const out = new Map<number, number>();
  if (Number.isNaN(first)) return out;
  series.values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) return;
    const { year, month: m } = splitFractionalYear(first + i / 12);
    if (series.yearly ? !out.has(year) : m === month) out.set(year, v);
  });
  return out;
}

/** min/max of a year -> value map (same shape as seriesRange). */
function mapRange(values: Map<number, number>): { min: number; max: number } | null {
  return seriesRange([...values.values()]);
}

/**
 * Month travel paths: the line joins the month's value of consecutive years at
 * x = year + (month-1)/12 (a missing year starts a new sub-path); `dots` marks
 * isolated years, which would otherwise draw nothing.
 */
export function buildMonthPaths(
  values: Map<number, number>,
  month: number,
  startYear: number,
  edge: number,
  range: { min: number; max: number } | null = mapRange(values)
): { d: string; dots: string } {
  if (!range) return { d: '', dots: '' };
  const f = (n: number) => n.toFixed(2);
  const offset = (month - 1) / 12;
  const years = [...values.keys()].sort((a, b) => a - b);
  const line: string[] = [];
  const dots: string[] = [];
  years.forEach((year, k) => {
    const x = f(yearToX(year + offset, startYear, edge));
    const y = f(valueToY(values.get(year)!, range.min, range.max));
    const joined = k > 0 && years[k - 1] === year - 1;
    line.push(`${joined ? 'L' : 'M'}${x} ${y}`);
    if (!joined && years[k + 1] !== year + 1) dots.push(`M${x} ${y}h0.01`);
  });
  return { d: line.join(''), dots: dots.join('') };
}

function extremes(series: DatasetSeries) {
  const first = startToYear(series.start);
  let min: { v: number; i: number } | null = null;
  let max: { v: number; i: number } | null = null;
  series.values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) return;
    if (!min || v < min.v) min = { v, i };
    if (!max || v > max.v) max = { v, i };
  });
  return { first, min: min as { v: number; i: number } | null, max: max as { v: number; i: number } | null };
}

function dateText(series: DatasetSeries, index: number, locale: string): string {
  const year = startToYear(series.start) + index / 12;
  return series.yearly ? String(Math.floor(year + 1e-9)) : formatMonthYear(year, locale, 'long');
}

function describeMonthLine(line: ChartLine, month: number, t: TFunction, locale: string): string {
  let min: [number, number] | null = null;
  let max: [number, number] | null = null;
  for (const [year, v] of monthValues(line.series, month)) {
    if (!min || v < min[1]) min = [year, v];
    if (!max || v > max[1]) max = [year, v];
  }
  if (!min || !max) return t('player:graph.lineNoData', { name: line.name });
  const { units, anomaly } = line.series;
  const date = (year: number) =>
    line.series.yearly ? String(year) : formatMonthYear(year + (month - 1) / 12, locale, 'long');
  return t('player:graph.lineSummary', {
    name: line.name,
    min: formatReading(min[1], units, anomaly, t, { speakable: true }),
    max: formatReading(max[1], units, anomaly, t, { speakable: true }),
    minDate: date(min[0]),
    maxDate: date(max[0]),
  });
}

function describeLine(line: ChartLine, t: TFunction, locale: string, month: number | null = null): string {
  if (month) return describeMonthLine(line, month, t, locale);
  const { min, max } = extremes(line.series);
  if (!min || !max) return t('player:graph.lineNoData', { name: line.name });
  const { units, anomaly } = line.series;
  return t('player:graph.lineSummary', {
    name: line.name,
    min: formatReading(min.v, units, anomaly, t, { speakable: true }),
    max: formatReading(max.v, units, anomaly, t, { speakable: true }),
    minDate: dateText(line.series, min.i, locale),
    maxDate: dateText(line.series, max.i, locale),
  });
}

/**
 * Line graph of the selected area's data, drawn across the full player width above the controls
 * (same x axis as the Timeline: fractions of the period). One line per dataset, each on its own min-max scale.
 * Keyboard users drive it through the Timeline slider; the pointer parts are mouse extras.
 */
export function SeriesChart({
  lines,
  status,
  errorKind = null,
  onRetry,
  zoneName = null,
  startYear,
  endYear,
  timelineEnd,
  position,
  hoverFraction,
  onHoverChange,
  onSeek,
  month = null,
}: SeriesChartProps) {
  const { t, i18n } = useTranslation('player');
  const locale = i18n.language;
  const plotRef = useRef<HTMLDivElement>(null);
  const messageRef = useRef<HTMLDivElement>(null);

  const edge = timelineEnd ?? endYear + 1;
  const span = Math.max(1e-6, edge - startYear);
  const fractionOf = (year: number) => Math.max(0, Math.min(1, (year - startYear) / span));
  const hoverYear = hoverFraction === null ? null : startYear + hoverFraction * span;
  // Month travel: the date read is that month of the year under the playhead / pointer
  const readYear = snapToMonth(hoverYear ?? position, month);

  const paths = useMemo(
    () =>
      lines.map((line) => {
        if (month) {
          const values = monthValues(line.series, month);
          const range = mapRange(values);
          return { line, range, ...buildMonthPaths(values, month, startYear, edge, range) };
        }
        const range = seriesRange(line.series.values);
        return {
          line,
          range,
          d: buildLinePath(line.series, startYear, edge, range),
          dots: buildDotsPath(line.series, startYear, edge, range),
        };
      }),
    [lines, startYear, edge, month]
  );

  const ticks = useMemo(
    () => buildTicks(startYear, endYear, edge).filter((tick) => tick.label),
    [startYear, endYear, edge]
  );

  const fractionFromEvent = useCallback((clientX: number): number | null => {
    const rect = plotRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return null;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  const summary = useMemo(() => {
    if (lines.length === 0) return '';
    return t(month ? 'graph.summaryMonth' : 'graph.summary', {
      zone: zoneName ?? t('graph.zoneFallback'),
      start: startYear,
      end: endYear,
      month: month ? monthName(month, locale, 'long') : '',
      datasets: lines.map((l) => l.name).join(', '),
      lines: lines.map((l) => describeLine(l, t, locale, month)).filter(Boolean).join(' '),
    });
  }, [lines, zoneName, startYear, endYear, t, locale, month]);

  // One row per year: the yearly mean, or in month travel that month's value
  const table = useMemo(() => {
    const means = lines.map((l) => (month ? monthValues(l.series, month) : yearlyMeans(l.series)));
    const years = new Set<number>();
    means.forEach((m) => m.forEach((_, y) => years.add(y)));
    return { means, years: [...years].sort((a, b) => a - b) };
  }, [lines, month]);

  if (status === 'idle') {
    return (
      <div className="series-chart series-chart-message">
        <p>{t('graph.empty')}</p>
      </div>
    );
  }
  if (status === 'loading') {
    return (
      <div className="series-chart series-chart-message" role="status" ref={messageRef} tabIndex={-1}>
        <div className="series-chart-skeleton" aria-hidden="true" />
        <p>{t('graph.loading')}</p>
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="series-chart series-chart-message" ref={messageRef} tabIndex={-1}>
        <p>
          <span role="alert">{errorKind ? t(`common:errors.${errorKind}`) : t('graph.error')}</span>
          {onRetry && (
            <button
              type="button"
              className="series-chart-retry"
              onClick={() => {
                // The button disappears while reloading: keep focus on the (status) container
                messageRef.current?.focus();
                onRetry();
              }}
            >
              {t('retry')}
            </button>
          )}
        </p>
      </div>
    );
  }
  if (lines.length === 0) {
    return (
      <div className="series-chart series-chart-message">
        <p>{t('graph.unavailable')}</p>
      </div>
    );
  }

  return (
    <div className="series-chart">
      <ul className="series-legend">
        {paths.map(({ line, range }) => {
          const { units, anomaly } = line.series;
          const value = valueAtYear(line.series, readYear);
          const zeroShown = anomaly && range !== null && range.min < 0 && range.max > 0;
          return (
            <li key={line.id} className="series-legend-item">
              <svg className="series-swatch" viewBox="0 0 24 6" aria-hidden="true">
                <line
                  x1="0"
                  y1="3"
                  x2="24"
                  y2="3"
                  stroke={line.color}
                  strokeWidth="3"
                  strokeDasharray={dashFor(line.id)}
                />
              </svg>
              <span className="series-legend-name">{line.name}</span>
              <span className="series-legend-value">
                {value === null ? t('graph.noData') : formatReading(value, units, anomaly, t)}
              </span>
              {value === null && units && (
                <span className="series-legend-units">{formatUnits(units)}</span>
              )}
              {zeroShown && <span className="series-legend-zero">{t('graph.zeroNormal')}</span>}
            </li>
          );
        })}
        <li className="series-legend-note">
          <span>{formatMonthYear(readYear, locale, 'short')}</span>
          <span> · {t('graph.scaleNote')}</span>
        </li>
      </ul>

      <div className="series-plot" ref={plotRef}>
        <svg
          className="series-svg"
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={summary}
        >
          <title>{t('graph.title')}</title>
          {paths.map(({ line, range }) => {
            if (!(line.series.anomaly && range && range.min < 0 && range.max > 0)) return null;
            const y = valueToY(0, range.min, range.max);
            return (
              <line
                key={`zero-${line.id}`}
                className="series-zero"
                x1="0"
                x2={VIEW_W}
                y1={y}
                y2={y}
                stroke={line.color}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
          {paths.map(({ line, d, dots }) => (
            <g key={line.id}>
              <path
                className="series-line"
                d={d}
                fill="none"
                stroke={line.color}
                strokeDasharray={dashFor(line.id)}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              {dots && (
                <path
                  className="series-dots"
                  d={dots}
                  fill="none"
                  stroke={line.color}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </g>
          ))}
        </svg>

        <div
          className="series-playhead"
          style={{ left: `${fractionOf(position) * 100}%` }}
          aria-hidden="true"
        />
        {hoverFraction !== null && (
          <div
            className="series-hover"
            style={{ left: `${hoverFraction * 100}%` }}
            aria-hidden="true"
          />
        )}
        {/* Mouse-only extras: the Timeline slider below is the keyboard route */}
        <div
          className="series-pointer"
          role="presentation"
          aria-hidden="true"
          onMouseMove={(e) => onHoverChange(fractionFromEvent(e.clientX))}
          onMouseLeave={() => onHoverChange(null)}
          onClick={(e) => {
            const f = fractionFromEvent(e.clientX);
            if (f !== null) onSeek(f);
          }}
        />
      </div>

      <div className="series-axis" aria-hidden="true">
        {ticks.map((tick) => (
          <span
            key={tick.year}
            className="series-axis-label"
            style={{ left: `${fractionOf(tick.year) * 100}%` }}
          >
            {tick.year}
          </span>
        ))}
      </div>

      <table className="sr-only">
        <caption>
          {month
            ? t('graph.tableCaptionMonth', { month: monthName(month, locale, 'long') })
            : t('graph.tableCaption')}
        </caption>
        <thead>
          <tr>
            <th scope="col">{t('graph.year')}</th>
            {lines.map((l) => (
              <th scope="col" key={l.id}>
                {l.name}
                {l.series.units ? ` (${formatUnits(l.series.units)})` : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.years.map((year) => (
            <tr key={year}>
              <th scope="row">{year}</th>
              {lines.map((l, i) => {
                const v = table.means[i].get(year);
                return (
                  <td key={l.id}>
                    {v === undefined
                      ? t('graph.noData')
                      : formatReading(v, l.series.units, l.series.anomaly, t, { speakable: true })}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** SeriesChart fed by the playback position store: only this subtree re-renders per tick */
export function LiveSeriesChart({
  positionStore,
  ...props
}: Omit<SeriesChartProps, 'position'> & { positionStore: PositionStore }) {
  const raw = usePlaybackPosition(positionStore);
  return <SeriesChart {...props} position={raw ?? props.startYear} />;
}

export default SeriesChart;
