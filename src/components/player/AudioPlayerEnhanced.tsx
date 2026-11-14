import { useCallback, useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Timeline } from './Timeline';
import { VolumeControl } from './VolumeControl';
import type { TrackState } from '../../types/tracks';
import type { SonificationError, SonificationStatus } from '../../hooks/useSonification';
import type { InstrumentsStatus } from '../../hooks/useInstruments';
import type { ApiErrorKind } from '../../services/sonificationApi';
import './AudioPlayerEnhanced.css';

interface AudioPlayerEnhancedProps {
  isPlaying: boolean;
  progress: number;
  currentYear: number;
  yearRange: { start: number; end: number };
  trackStates: TrackState[];
  onPlay: () => void;
  onPause: () => void;
  onSeek: (position: number) => void;
  onSeekToYear: (year: number) => void;
  onVolumeChange: (volume: number) => void;
  onOpenTrackPanel: () => void;
  /** Disable Play (e.g. no zone selected yet). Pause stays available. */
  playDisabled?: boolean;
  /** Backend request status */
  status?: SonificationStatus;
  error?: SonificationError | null;
  /** Playback reached the end of the data */
  hasEnded?: boolean;
  /** false when no track is enabled or no area is selected */
  canPlay?: boolean;
  onRetry?: () => void;
  /** Loading state of the track list (GET /api/instruments) */
  tracksStatus?: InstrumentsStatus;
  /** Why the track list failed to load, when tracksStatus is 'error' */
  tracksErrorKind?: ApiErrorKind | null;
}

/**
 * Enhanced audio player with timeline, position display, and track controls
 *
 * Features:
 * - Year-based timeline with markers
 * - Current year and time display
 * - Volume control with mute toggle
 * - Track panel toggle
 * - Full keyboard navigation
 */
export function AudioPlayerEnhanced({
  isPlaying,
  progress,
  currentYear,
  yearRange,
  trackStates,
  onPlay,
  onPause,
  onSeek,
  onSeekToYear,
  onVolumeChange,
  onOpenTrackPanel,
  playDisabled = false,
  status = 'idle',
  error = null,
  hasEnded = false,
  canPlay = true,
  onRetry,
  tracksStatus = 'ready',
  tracksErrorKind = null,
}: AudioPlayerEnhancedProps) {
  const { t } = useTranslation('player');
  const [volume, setVolume] = useState(0.5);
  const [isMuted, setIsMuted] = useState(false);
  const playButtonRef = useRef<HTMLButtonElement>(null);
  const isLoading = status === 'loading';
  const hasError = status === 'error' && error !== null;

  const handleRetry = useCallback(() => {
    // The Retry button disappears once clicked: keep keyboard focus in the player
    playButtonRef.current?.focus();
    onRetry?.();
  }, [onRetry]);
  // Pausing is always allowed (WCAG 1.4.2), only starting playback can be disabled
  const playBlocked = playDisabled || !canPlay;
  const playPauseDisabled = playBlocked && !isPlaying;

  // Explain the real blocker, most fundamental first: without the track
  // list, picking a zone or a track cannot make Play work
  const playDisabledHint =
    tracksStatus === 'error'
      ? t(`common:errors.${tracksErrorKind ?? 'unknown'}`)
      : tracksStatus === 'loading'
        ? t('common:tracks.loading')
        : playDisabled
          ? t('controls.selectZoneFirst')
          : !canPlay
            ? t('noTrackHint')
            : null;

  // Spoken when Play is activated while blocked (the button stays focusable)
  const [blockedNotice, setBlockedNotice] = useState('');
  // Loading is announced on the first load, then only when it takes noticeably long
  const [loadingNotice, setLoadingNotice] = useState(false);
  const firstLoad = useRef(true);

  useEffect(() => {
    if (!isLoading) {
      setLoadingNotice(false);
      return;
    }
    if (firstLoad.current) {
      firstLoad.current = false;
      setLoadingNotice(true);
      return;
    }
    const id = window.setTimeout(() => setLoadingNotice(true), 1000);
    return () => window.clearTimeout(id);
  }, [isLoading]);

  useEffect(() => {
    if (!blockedNotice) return;
    const id = window.setTimeout(() => setBlockedNotice(''), 6000);
    return () => window.clearTimeout(id);
  }, [blockedNotice]);

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      onPause();
    } else if (!playBlocked) {
      setBlockedNotice('');
      onPlay();
    } else if (playDisabledHint) {
      // Clear first so repeated activations are announced again
      setBlockedNotice('');
      window.setTimeout(() => setBlockedNotice(playDisabledHint), 50);
    }
  }, [isPlaying, playBlocked, playDisabledHint, onPlay, onPause]);

  const handleVolumeChange = useCallback(
    (newVolume: number) => {
      setVolume(newVolume);
      setIsMuted(newVolume === 0);
      onVolumeChange(newVolume);
    },
    [onVolumeChange]
  );

  const handleMuteToggle = useCallback(() => {
    if (isMuted) {
      setIsMuted(false);
      onVolumeChange(volume);
    } else {
      setIsMuted(true);
      onVolumeChange(0);
    }
  }, [isMuted, volume, onVolumeChange]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Leave browser/assistive-tech shortcuts (Cmd/Ctrl/Alt + key) alone
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const target = e.target instanceof Element ? e.target : null;
      // Form fields and sliders handle their own keys (typing, arrows, Home/End)
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="slider"]')) {
        return;
      }
      // Space on a focused button/link must activate THAT control
      // (e.g. "Audio tracks"), not toggle playback
      if (e.key === ' ' && target?.closest('button, a, [role="button"]')) {
        return;
      }
      // Don't steal keys while a dialog (track panel, shortcuts help) is open
      if (document.querySelector('[aria-modal="true"]')) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          handlePlayPause();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          onSeek(Math.max(0, progress - 0.02));
          break;
        case 'ArrowRight':
          e.preventDefault();
          onSeek(Math.min(1, progress + 0.02));
          break;
        case 'Home':
          e.preventDefault();
          onSeek(0);
          break;
        case 'End':
          e.preventDefault();
          onSeek(1);
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          handleMuteToggle();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePlayPause, handleMuteToggle, onSeek, progress]);

  const enabledTracksCount = trackStates.filter((t) => t.enabled).length;

  return (
    <div className="audio-player-enhanced">
      {/* Visible status line: loading / error with Retry / end of data / no track */}
      {isLoading && (
        <p className="player-message">
          {t('loadingChunk', { year: currentYear })}
        </p>
      )}
      {hasError && (
        <p className="player-message error" role="alert">
          <span>{t(`common:errors.${error.kind}`)}</span>
          <button type="button" className="player-retry" onClick={handleRetry}>
            {t('retry')}
          </button>
        </p>
      )}
      {!isLoading && !hasError && hasEnded && (
        <p className="player-message">{t('endOfData')}</p>
      )}
      {playPauseDisabled && playDisabledHint && (
        <p id="play-disabled-hint" className="player-message">
          {playDisabledHint}
        </p>
      )}

      <div className="player-center">
        <button
          type="button"
          className="control-button skip-back"
          onClick={() => onSeek(Math.max(0, progress - 0.1))}
          aria-label={t('controls.skipBackward')}
        >
          <SkipBackIcon />
        </button>

        <button
          type="button"
          className="control-button play-pause"
          ref={playButtonRef}
          onClick={handlePlayPause}
          aria-disabled={playPauseDisabled || undefined}
          aria-describedby={playPauseDisabled ? 'play-disabled-hint' : undefined}
          aria-label={isPlaying ? t('controls.pause') : t('controls.play')}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>

        <button
          type="button"
          className="control-button skip-forward"
          onClick={() => onSeek(Math.min(1, progress + 0.1))}
          aria-label={t('controls.skipForward')}
        >
          <SkipForwardIcon />
        </button>
      </div>

      <span className="player-year" aria-hidden="true">
        {currentYear}
      </span>

      <div className="player-timeline">
        <Timeline
          progress={progress}
          currentYear={currentYear}
          startYear={yearRange.start}
          endYear={yearRange.end}
          onSeek={onSeek}
          onSeekToYear={onSeekToYear}
        />
      </div>

      <div className="player-right">
        <VolumeControl
          volume={isMuted ? 0 : volume}
          onVolumeChange={handleVolumeChange}
          onMuteToggle={handleMuteToggle}
          isMuted={isMuted}
        />

        <button
          type="button"
          className="control-button tracks-button"
          onClick={onOpenTrackPanel}
          aria-label={t('controls.tracks', { count: enabledTracksCount })}
        >
          <TracksIcon />
          {enabledTracksCount > 0 && (
            <span className="tracks-badge" aria-hidden="true">{enabledTracksCount}</span>
          )}
        </button>
      </div>

      {/* One permanently mounted live region. Play/pause state is carried by the button label. */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {blockedNotice ||
          (hasError
            ? ''
            : isLoading
              ? loadingNotice
                ? t('status.loading')
                : ''
              : hasEnded
                ? t('endOfData')
                : '')}
      </div>
    </div>
  );
}

// Icon components
function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  );
}

function SkipBackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
    </svg>
  );
}

function SkipForwardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
    </svg>
  );
}

function TracksIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M9 18V5l12-2v13" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="6" cy="18" r="3" fill="currentColor" />
      <circle cx="18" cy="16" r="3" fill="currentColor" />
    </svg>
  );
}

export default AudioPlayerEnhanced;
