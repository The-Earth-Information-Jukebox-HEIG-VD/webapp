import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatMonthYear } from '../../utils/formatDate';
import { snapToMonth } from '../../services/sonificationApi';
import './Timeline.css';

interface TimelineProps {
  progress: number;
  currentYear: number;
  startYear: number;
  endYear: number;
  /** Current position as a fractional year */
  position?: number;
  /** Right edge of the track (fractional year, month after the last data) */
  timelineEnd?: number;
  onSeek: (position: number) => void;
  onSeekToYear: (year: number) => void;
  /** Hover position along the track (0..1), null when the pointer leaves */
  onHoverChange?: (fraction: number | null) => void;
  /** Hide the date bubble (e.g. when the data graph shows the hovered date) */
  hideHoverTooltip?: boolean;
  /** Month travel (1..12): dates read as that month of each year ("July 1950") */
  month?: number | null;
}

export interface Tick {
  year: number;
  kind: 'minor' | 'medium' | 'major';
  label: boolean;
}

/** Ticks: minor every year, medium every 5, labelled majors every 10/20/50 by span. */
export function buildTicks(startYear: number, endYear: number, timelineEnd: number): Tick[] {
  const span = Math.max(1, timelineEnd - startYear);
  const interval = span > 100 ? 50 : span > 50 ? 20 : 10;
  const ticks: Tick[] = [];
  for (let year = Math.ceil(startYear); year <= endYear; year++) {
    if (year % interval === 0) ticks.push({ year, kind: 'major', label: true });
    else if (year % 5 === 0) ticks.push({ year, kind: 'medium', label: false });
    else ticks.push({ year, kind: 'minor', label: false });
  }
  return ticks;
}

/**
 * Interactive timeline showing playback progress
 *
 * Features:
 * - Year ticks (minor/medium/labelled major)
 * - Gradient fill showing warm/cool progression
 * - Click/drag to seek, hover preview of month + year
 * - Keyboard: arrows 2%, Shift+arrows 1 month, PageUp/PageDown 1 year, Home/End
 */
export function Timeline({
  progress,
  currentYear,
  startYear,
  endYear,
  position,
  timelineEnd,
  onSeek,
  onSeekToYear,
  onHoverChange,
  hideHoverTooltip = false,
  month = null,
}: TimelineProps) {
  const { t, i18n } = useTranslation('player');
  const trackRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const [hover, setHover] = useState<{ fraction: number } | null>(null);

  const edge = timelineEnd ?? endYear + 1;
  const span = Math.max(1e-6, edge - startYear);
  const current = position ?? currentYear;
  const locale = i18n.language;
  // Month travel: the playhead crosses a whole year per bar, the date is that year's month
  const currentDate = snapToMonth(current, month);
  const currentText = formatMonthYear(currentDate, locale, 'long');

  const ticks = useMemo(() => buildTicks(startYear, endYear, edge), [startYear, endYear, edge]);
  const showMinor = span <= 150;

  const handleHover = useCallback((e: React.MouseEvent) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHover({ fraction });
    onHoverChange?.(fraction);
  }, [onHoverChange]);

  const handleSeek = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!trackRef.current) return;

      const rect = trackRef.current.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const position = (clientX - rect.left) / rect.width;
      onSeek(Math.max(0, Math.min(1, position)));
    },
    [onSeek]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isDragging.current = true;
      handleSeek(e);

      const handleMouseMove = (e: MouseEvent) => {
        if (isDragging.current && trackRef.current) {
          const rect = trackRef.current.getBoundingClientRect();
          const position = (e.clientX - rect.left) / rect.width;
          onSeek(Math.max(0, Math.min(1, position)));
        }
      };

      const handleMouseUp = () => {
        isDragging.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [handleSeek, onSeek]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const step = 0.02;
      // Month travel: the finest step is one year (each bar is a year), from the date heard
      const from = month ? currentDate : current;
      const fine = month ? 1 : 1 / 12;
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          if (e.shiftKey) onSeekToYear(from - fine);
          else onSeek(Math.max(0, progress - step));
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (e.shiftKey) onSeekToYear(from + fine);
          else onSeek(Math.min(1, progress + step));
          break;
        case 'PageUp':
          e.preventDefault();
          onSeekToYear(from + 1);
          break;
        case 'PageDown':
          e.preventDefault();
          onSeekToYear(from - 1);
          break;
        case 'Home':
          e.preventDefault();
          onSeek(0);
          break;
        case 'End':
          e.preventDefault();
          onSeek(1);
          break;
      }
    },
    [onSeek, onSeekToYear, progress, current, currentDate, month]
  );

  const progressPercent = progress * 100;

  return (
    <div className="timeline">
      <div className="timeline-years">
        <span className="year-start">{startYear}</span>
        <span className="year-end">{endYear}</span>
      </div>

      <div
        ref={trackRef}
        className="timeline-track"
        role="slider"
        tabIndex={0}
        aria-label={t('timeline.label')}
        aria-valuemin={startYear}
        aria-valuemax={endYear}
        aria-valuenow={currentYear}
        aria-valuetext={currentText}
        onMouseDown={handleMouseDown}
        onMouseMove={handleHover}
        onMouseLeave={() => {
          setHover(null);
          onHoverChange?.(null);
        }}
        onKeyDown={handleKeyDown}
      >
        {/* Background track */}
        <div className="track-background" />

        {/* Progress fill */}
        <div
          className="track-progress"
          style={{ width: `${progressPercent}%` }}
        />

        {/* Year ticks */}
        <div className={`track-markers${showMinor ? '' : ' no-minor'}`} aria-hidden="true">
          {ticks.map(({ year, kind, label }) => (
            <div
              key={year}
              className={`track-marker ${kind}`}
              style={{ left: `${((year - startYear) / span) * 100}%` }}
              aria-hidden="true"
            >
              <span className="marker-line" />
              {label && <span className="marker-year">{year}</span>}
            </div>
          ))}
        </div>

        {/* Hover preview */}
        {hover && !hideHoverTooltip && (
          <div
            className="track-hover"
            style={{ left: `${hover.fraction * 100}%` }}
            aria-hidden="true"
          >
            {formatMonthYear(snapToMonth(startYear + hover.fraction * span, month), locale, 'short')}
          </div>
        )}

        {/* Current position thumb */}
        <div
          className="track-thumb"
          style={{ left: `${progressPercent}%` }}
          aria-hidden="true"
        >
          <span className="thumb-indicator" />
          <span className="thumb-year">{formatMonthYear(currentDate, locale, 'short')}</span>
        </div>
      </div>
    </div>
  );
}

export default Timeline;
