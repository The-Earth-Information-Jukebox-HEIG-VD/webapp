import { useCallback, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Timeline } from './Timeline';
import { VolumeControl } from './VolumeControl';
import type { TrackState } from '../../types/tracks';
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
}: AudioPlayerEnhancedProps) {
  const { t } = useTranslation('player');
  const [volume, setVolume] = useState(0.5);
  const [isMuted, setIsMuted] = useState(false);

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      onPause();
    } else {
      onPlay();
    }
  }, [isPlaying, onPlay, onPause]);

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
          onClick={handlePlayPause}
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

      {/* Status announcement for screen readers */}
      <div className="sr-only" role="status" aria-live="polite">
        {isPlaying ? t('status.playing') : t('status.paused')}
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
