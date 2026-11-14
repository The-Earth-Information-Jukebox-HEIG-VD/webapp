import { useTranslation } from 'react-i18next';
import type { Track } from '../../types/tracks';
import { periodYear } from '../../services/sonificationApi';
import './TrackCheckbox.css';

interface TrackCheckboxProps {
  track: Track;
  enabled: boolean;
  /** Instrument name from the backend /api/instruments (defaults to track.instrument) */
  instrumentName?: string;
  onToggle: (enabled: boolean) => void;
}

/**
 * Individual track checkbox.
 *
 * Shows the track name, its instrument, the period covered and whether the data
 * is observed or simulated. Tracks the server has no data for are disabled and
 * say why. (The server returns one mixed file, so there is no per-track volume.)
 */
export function TrackCheckbox({ track, enabled, instrumentName, onToggle }: TrackCheckboxProps) {
  const { t } = useTranslation();

  const trackName = t(track.nameKey, { defaultValue: track.label });
  const instrument = instrumentName ?? track.instrument;
  const start = periodYear(track.period?.start);
  const end = periodYear(track.period?.end);
  const descId = `${track.id}-desc`;
  const instrumentId = `${track.id}-instrument`;

  return (
    <div
      className={`track-checkbox ${enabled ? 'enabled' : ''} ${track.available ? '' : 'unavailable'}`}
    >
      <div className="track-header">
        <label className="track-toggle">
          <input
            type="checkbox"
            checked={enabled}
            disabled={!track.available}
            onChange={(e) => onToggle(e.target.checked)}
            aria-describedby={instrument ? `${instrumentId} ${descId}` : descId}
          />
          <span
            className="track-color"
            style={{ backgroundColor: track.color }}
            aria-hidden="true"
          />
          <span className="track-name">{trackName}</span>
        </label>

        {instrument && <span id={instrumentId} className="track-instrument">{instrument}</span>}
      </div>

      <p id={descId} className="track-meta">
        {track.available ? (
          <>
            {start !== null && end !== null && (
              <span>{t('tracks.period', { start, end })}</span>
            )}
          </>
        ) : (
          <span>{t('tracks.unavailable')}</span>
        )}
      </p>
    </div>
  );
}

export default TrackCheckbox;
