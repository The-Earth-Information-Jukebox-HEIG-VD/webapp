import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Track, TrackState } from '../../types/tracks';
import type { InstrumentsStatus } from '../../hooks/useInstruments';
import { periodYear, type ApiErrorKind } from '../../services/sonificationApi';
import { InfoTooltip } from './InfoTooltip';
import './TrackPanel.css';

interface TrackPanelProps {
  /** Tracks built from the backend's /api/instruments */
  tracks: Track[];
  trackStates: TrackState[];
  status: InstrumentsStatus;
  errorKind?: ApiErrorKind | null;
  /** The server is still converting its data */
  preparing?: boolean;
  onTrackToggle: (trackId: string, enabled: boolean) => void;
  onRetry: () => void;
  /** Datasets with a value in the audible chunk while playing */
  soundingIds?: Set<string>;
  /** false: only the heading (with its show/hide toggle) and a summary are shown */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * "What do you want to hear?" panel.
 * One toggle button (aria-pressed) per dataset: colour dot, name, always-visible
 * instrument, period, check icon when on. The heading is a disclosure button
 * (aria-expanded) that hides the list; a "N tracks selected" summary stays visible.
 */
export function TrackPanel({
  tracks,
  trackStates,
  status,
  errorKind,
  preparing = false,
  onTrackToggle,
  onRetry,
  soundingIds,
  open = true,
  onOpenChange,
}: TrackPanelProps) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const enabledCount = trackStates.filter((s) => s.enabled).length;

  // The error block (and its Retry button) disappears on retry: keep focus in the panel
  const handleRetry = useCallback(() => {
    rootRef.current?.focus();
    onRetry();
  }, [onRetry]);

  // One permanently mounted live region; the visible messages have no role
  const liveMessage =
    status === 'loading'
      ? t('tracks.loading')
      : status === 'ready' && preparing
        ? t('errors.serverPreparing')
        : status === 'ready' && enabledCount === 0
          ? t('tracks.noneSelected')
          : '';

  return (
    <div ref={rootRef} tabIndex={-1} className="track-panel">
      <div className="track-panel-header">
      <h2 id="track-panel-heading" className="track-panel-heading">
        {onOpenChange ? (
          <button
            type="button"
            className="track-panel-toggle"
            aria-expanded={open}
            aria-controls="track-panel-body"
            onClick={() => onOpenChange(!open)}
          >
            <span className="track-panel-toggle-title">{t('tracks.heading')}</span>
            {/* State is conveyed by aria-expanded; the visible word is for sighted users */}
            <span className="track-panel-toggle-action" aria-hidden="true">
              {open ? t('tracks.hide') : t('tracks.show')}
              <svg className="track-panel-chevron" viewBox="0 0 24 24">
                <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </button>
        ) : (
          t('tracks.heading')
        )}
      </h2>
      <InfoTooltip label={t('tracks.infoLabel')} align="end">
        <p>{t('tracks.hint')}</p>
      </InfoTooltip>
      </div>

      {/* Outside the collapsible body: announcements keep working while collapsed */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </div>

      {!open && status === 'ready' && (
        <p className="track-panel-summary">{t('tracks.selectedCount', { count: enabledCount })}</p>
      )}

      <div id="track-panel-body" className="track-panel-body" hidden={!open}>

      {status === 'error' && (
        <div className="track-panel-status error" role="alert">
          <p>{t(`errors.${errorKind ?? 'unknown'}`)}</p>
          <button type="button" className="track-panel-retry" onClick={handleRetry}>
            {t('tracks.retry')}
          </button>
        </div>
      )}

      {status === 'ready' && preparing && (
        <p className="track-panel-status">{t('errors.serverPreparing')}</p>
      )}

      {status === 'ready' && enabledCount === 0 && (
        <p className="track-panel-status">{t('tracks.noneSelected')}</p>
      )}

      <div className="track-panel-list" aria-busy={status === 'loading'}>
        {status === 'loading' &&
          [0, 1, 2].map((i) => (
            <div key={i} className="track-row-skeleton" aria-hidden="true" />
          ))}
        {tracks.map((track) => {
          const enabled = trackStates.find((s) => s.id === track.id)?.enabled ?? false;
          const name = t(track.nameKey, { defaultValue: track.label });
          const start = periodYear(track.period?.start);
          const end = periodYear(track.period?.end);
          const metaId = `${track.id}-row-meta`;
          const nameId = `${track.id}-row-name`;
          const instrumentId = `${track.id}-row-instrument`;
          const sounding = enabled && soundingIds?.has(track.id);
          return (
            <button
              key={track.id}
              type="button"
              className={`track-row${enabled ? ' on' : ''}`}
              aria-pressed={enabled}
              aria-disabled={!track.available || undefined}
              // Name = dataset + instrument; the period/availability line is the description
              // (otherwise it would be read twice: once in the content-derived name, once as description)
              aria-labelledby={track.instrument ? `${nameId} ${instrumentId}` : nameId}
              aria-describedby={metaId}
              data-track-row
              onClick={() => {
                if (track.available) onTrackToggle(track.id, !enabled);
              }}
            >
              <span className="track-row-dot" style={{ backgroundColor: track.color }} aria-hidden="true" />
              <span className="track-row-text">
                <span id={nameId} className="track-row-name">{name}</span>
                {track.instrument && (
                  <span id={instrumentId} className="track-row-instrument">
                    {track.instrument}
                    {sounding && (
                      <span className="sounding-bars" data-testid="sounding" aria-hidden="true">
                        <i /><i /><i />
                      </span>
                    )}
                  </span>
                )}
                <span id={metaId} className="track-row-meta">
                  {track.available ? (
                    <>
                      {start !== null && end !== null && <span>{t('tracks.period', { start, end })}</span>}
                      {!track.alwaysPlaying && (
                        <span className="track-row-note">{t('tracks.onlyWhenPresent')}</span>
                      )}
                    </>
                  ) : (
                    <span>{t('tracks.unavailable')}</span>
                  )}
                </span>
              </span>
              <svg className="track-row-check" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          );
        })}
      </div>
      </div>
    </div>
  );
}

export default TrackPanel;
