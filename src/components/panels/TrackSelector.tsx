import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Track, TrackState } from '../../types/tracks';
import type { InstrumentsStatus } from '../../hooks/useInstruments';
import type { ApiErrorKind } from '../../services/sonificationApi';
import { TrackCheckbox } from './TrackCheckbox';
import './TrackSelector.css';

interface TrackSelectorProps {
  /** Tracks built from the backend's /api/instruments */
  tracks: Track[];
  trackStates: TrackState[];
  status: InstrumentsStatus;
  errorKind?: ApiErrorKind | null;
  /** The server is still converting its data */
  preparing?: boolean;
  onTrackToggle: (trackId: string, enabled: boolean) => void;
  onRetry: () => void;
}

/**
 * Track selector for multi-track sonification.
 *
 * Lists the instruments the server offers (loaded at runtime) and lets the user
 * enable several at once. Handles the loading and error states accessibly.
 */
export function TrackSelector({
  tracks,
  trackStates,
  status,
  errorKind,
  preparing = false,
  onTrackToggle,
  onRetry,
}: TrackSelectorProps) {
  const { t } = useTranslation();

  const enabledCount = trackStates.filter((s) => s.enabled).length;
  const rootRef = useRef<HTMLDivElement>(null);

  // The error block (and its Retry button) disappears on retry: move focus to
  // the selector itself so it stays inside the panel's focus trap
  const handleRetry = useCallback(() => {
    rootRef.current?.focus();
    onRetry();
  }, [onRetry]);

  // One permanently mounted live region; the visible messages below have no role
  const liveMessage =
    status === 'loading'
      ? t('tracks.loading')
      : status === 'ready' && preparing
        ? t('errors.serverPreparing')
        : status === 'ready' && enabledCount === 0
          ? t('tracks.noneSelected')
          : '';

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      className="track-selector"
      role="group"
      aria-label={t('tracks.title')}
    >
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </div>

      <p className="track-selector-description">{t('tracks.description')}</p>

      {status === 'loading' && (
        <p className="track-selector-status">
          {t('tracks.loading')}
        </p>
      )}

      {status === 'error' && (
        <div className="track-selector-status error" role="alert">
          <p>{t(`errors.${errorKind ?? 'unknown'}`)}</p>
          <button type="button" className="track-selector-retry" onClick={handleRetry}>
            {t('tracks.retry')}
          </button>
        </div>
      )}

      {status === 'ready' && preparing && (
        <p className="track-selector-status">
          {t('errors.serverPreparing')}
        </p>
      )}

      {status === 'ready' && enabledCount === 0 && (
        <p className="track-selector-status">
          {t('tracks.noneSelected')}
        </p>
      )}

      <div className="track-list" aria-busy={status === 'loading'}>
        {tracks.map((track) => {
          const state = trackStates.find((s) => s.id === track.id);
          return (
            <TrackCheckbox
              key={track.id}
              track={track}
              enabled={state?.enabled ?? false}
              onToggle={(enabled) => onTrackToggle(track.id, enabled)}
            />
          );
        })}
      </div>
    </div>
  );
}

export default TrackSelector;
