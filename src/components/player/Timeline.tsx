import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import './Timeline.css';

interface TimelineProps {
  progress: number;
  currentYear: number;
  startYear: number;
  endYear: number;
  onSeek: (position: number) => void;
  onSeekToYear: (year: number) => void;
}

/**
 * Interactive timeline showing playback progress
 *
 * Features:
 * - Year markers at significant intervals
 * - Gradient fill showing warm/cool progression
 * - Click/drag to seek
 * - Keyboard accessible
 */
export function Timeline({
  progress,
  currentYear,
  startYear,
  endYear,
  onSeek,
}: TimelineProps) {
  const { t } = useTranslation('player');
  const trackRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const totalYears = endYear - startYear;

  // Generate year markers at reasonable intervals
  const getYearMarkers = useCallback(() => {
    const markers: number[] = [];
    const interval = totalYears > 100 ? 50 : totalYears > 50 ? 20 : 10;

    let year = Math.ceil(startYear / interval) * interval;
    while (year <= endYear) {
      if (year >= startYear) {
        markers.push(year);
      }
      year += interval;
    }

    // Always include end year if not already there
    if (!markers.includes(endYear)) {
      markers.push(endYear);
    }

    return markers;
  }, [startYear, endYear, totalYears]);

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
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          onSeek(Math.max(0, progress - step));
          break;
        case 'ArrowRight':
          e.preventDefault();
          onSeek(Math.min(1, progress + step));
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
    [onSeek, progress]
  );

  const yearMarkers = getYearMarkers();
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
        aria-valuetext={t('timeline.year', { year: currentYear })}
        onMouseDown={handleMouseDown}
        onKeyDown={handleKeyDown}
      >
        {/* Background track */}
        <div className="track-background" />

        {/* Progress fill */}
        <div
          className="track-progress"
          style={{ width: `${progressPercent}%` }}
        />

        {/* Year markers */}
        <div className="track-markers">
          {yearMarkers.map((year) => {
            const position = ((year - startYear) / totalYears) * 100;
            return (
              <div
                key={year}
                className="track-marker"
                style={{ left: `${position}%` }}
                aria-hidden="true"
              >
                <span className="marker-line" />
                <span className="marker-year">{year}</span>
              </div>
            );
          })}
        </div>

        {/* Current position thumb */}
        <div
          className="track-thumb"
          style={{ left: `${progressPercent}%` }}
          aria-hidden="true"
        >
          <span className="thumb-indicator" />
          <span className="thumb-year">{currentYear}</span>
        </div>
      </div>
    </div>
  );
}

export default Timeline;
