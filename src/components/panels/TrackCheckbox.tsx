import { useTranslation } from 'react-i18next';
import type { Track } from '../../types/tracks';
import './TrackCheckbox.css';

interface TrackCheckboxProps {
  track: Track;
  enabled: boolean;
  volume: number;
  /** Optional instrument name from backend /api/instruments */
  instrumentName?: string;
  onToggle: (enabled: boolean) => void;
  onVolumeChange: (volume: number) => void;
}

/**
 * Individual track checkbox with volume slider
 *
 * Displays track info, enable toggle, and volume control.
 * Instrument name is optionally provided from backend data.
 */
export function TrackCheckbox({
  track,
  enabled,
  volume,
  instrumentName,
  onToggle,
  onVolumeChange,
}: TrackCheckboxProps) {
  const { t } = useTranslation();

  const trackName = t(track.nameKey);
  const trackDescription = t(track.descriptionKey);

  return (
    <div className={`track-checkbox ${enabled ? 'enabled' : ''}`}>
      <div className="track-header">
        <label className="track-toggle">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
            aria-describedby={`${track.id}-desc`}
          />
          <span
            className="track-color"
            style={{ backgroundColor: track.color }}
            aria-hidden="true"
          />
          <span className="track-name">{trackName}</span>
        </label>

        {instrumentName && (
          <span className="track-instrument">{instrumentName}</span>
        )}
      </div>

      <p id={`${track.id}-desc`} className="track-description">
        {trackDescription}
      </p>

      {enabled && (
        <div className="track-volume">
          <label htmlFor={`${track.id}-volume`} className="volume-label">
            Volume
          </label>
          <input
            id={`${track.id}-volume`}
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            className="volume-slider"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(volume * 100)}
            aria-valuetext={`${Math.round(volume * 100)}%`}
          />
          <span className="volume-value" aria-hidden="true">
            {Math.round(volume * 100)}%
          </span>
        </div>
      )}
    </div>
  );
}

export default TrackCheckbox;
