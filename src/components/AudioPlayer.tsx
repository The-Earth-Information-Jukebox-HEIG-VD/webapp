import { useCallback } from 'react';
import './AudioPlayer.css';

interface AudioPlayerProps {
  isPlaying: boolean;
  progress: number;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onSeek: (position: number) => void;
  datasetName: string;
}

/**
 * AudioPlayer - Accessible audio control component
 *
 * Provides play/pause/stop controls and a progress slider
 * with full keyboard and screen reader support.
 */
export function AudioPlayer({
  isPlaying,
  progress,
  onPlay,
  onPause,
  onStop,
  onSeek,
  datasetName,
}: AudioPlayerProps) {
  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      onPause();
    } else {
      onPlay();
    }
  }, [isPlaying, onPlay, onPause]);

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseFloat(e.target.value);
      onSeek(value);
    },
    [onSeek]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case ' ':
          e.preventDefault();
          handlePlayPause();
          break;
        case 'ArrowLeft':
          onSeek(Math.max(0, progress - 0.05));
          break;
        case 'ArrowRight':
          onSeek(Math.min(1, progress + 0.05));
          break;
        case 'Home':
          onSeek(0);
          break;
        case 'End':
          onSeek(1);
          break;
      }
    },
    [handlePlayPause, onSeek, progress]
  );

  const progressPercent = Math.round(progress * 100);

  return (
    /* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
    <div
      className="audio-player"
      role="region"
      aria-label={`Audio player for ${datasetName}`}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* eslint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
      <div className="player-controls">
        <button
          className="control-button play-pause"
          onClick={handlePlayPause}
          aria-label={isPlaying ? 'Pause sonification' : 'Play sonification'}
        >
          {isPlaying ? (
            <PauseIcon />
          ) : (
            <PlayIcon />
          )}
        </button>

        <button
          className="control-button stop"
          onClick={onStop}
          aria-label="Stop and reset"
        >
          <StopIcon />
        </button>
      </div>

      <div className="progress-container">
        <label htmlFor="progress-slider" className="sr-only">
          Playback progress
        </label>
        <input
          id="progress-slider"
          type="range"
          className="progress-slider"
          min="0"
          max="1"
          step="0.01"
          value={progress}
          onChange={handleSliderChange}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPercent}
          aria-valuetext={`${progressPercent}% complete`}
        />
        <span className="progress-text" aria-hidden="true">
          {progressPercent}%
        </span>
      </div>

      <div className="player-status" aria-live="polite">
        {isPlaying ? 'Playing' : 'Paused'}
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

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 6h12v12H6z" />
    </svg>
  );
}

export default AudioPlayer;
