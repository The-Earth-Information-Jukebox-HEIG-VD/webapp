import { useTranslation } from 'react-i18next';
import { tracks } from '../../data/tracks';
import type { TrackState } from '../../types/tracks';
import { TrackCheckbox } from './TrackCheckbox';
import './TrackSelector.css';

interface TrackSelectorProps {
  trackStates: TrackState[];
  onTrackToggle: (trackId: string, enabled: boolean) => void;
  onTrackVolumeChange: (trackId: string, volume: number) => void;
}

/**
 * Track selector component for multi-track sonification
 *
 * Allows users to enable/disable tracks and adjust individual volumes.
 * Each track represents a different climate metric with its own instrument.
 */
export function TrackSelector({
  trackStates,
  onTrackToggle,
  onTrackVolumeChange,
}: TrackSelectorProps) {
  const { t } = useTranslation();

  return (
    <div className="track-selector" role="group" aria-label={t('tracks.title')}>
      <p className="track-selector-description">
        Enable multiple tracks to hear different climate metrics simultaneously.
        Each track uses a different instrument for distinction.
      </p>

      <div className="track-list">
        {tracks.map((track) => {
          const state = trackStates.find((s) => s.id === track.id);
          const isEnabled = state?.enabled ?? track.defaultEnabled;
          const volume = state?.volume ?? track.defaultVolume;

          return (
            <TrackCheckbox
              key={track.id}
              track={track}
              enabled={isEnabled}
              volume={volume}
              onToggle={(enabled) => onTrackToggle(track.id, enabled)}
              onVolumeChange={(vol) => onTrackVolumeChange(track.id, vol)}
            />
          );
        })}
      </div>
    </div>
  );
}

export default TrackSelector;
