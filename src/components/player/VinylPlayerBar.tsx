import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { VolumeControl } from './VolumeControl';
import { usePlayerShortcuts } from '../../hooks/usePlayerShortcuts';
import { usePlaybackPosition, type PositionStore } from '../../hooks/usePlaybackPosition';
import { elapsedOf } from '../../hooks/useVinylSonification';
import type { SonificationError, SonificationStatus } from '../../hooks/useSonification';
import { periodAt, type VinylChunkMeta } from '../../services/vinylApi';
import { periodToYear } from '../../services/sonificationApi';
import { formatMonthYear } from '../../utils/formatDate';
import type { TrackState } from '../../types/tracks';
import { VINYL_CHUNKS } from '../../utils/vinylGeometry';
import './AudioPlayerEnhanced.css';
import './VinylPlayerBar.css';

interface VinylPlayerBarProps {
  isPlaying: boolean;
  status: SonificationStatus;
  error: SonificationError | null;
  hasEnded: boolean;
  canPlay: boolean;
  /** Groove under the needle (0-based) */
  chunkIndex: number;
  /** Playback position of the vinyl player (the clock subscribes to it, once a second) */
  positionStore: PositionStore;
  /** Length of the side in seconds */
  totalSeconds: number;
  trackStates: TrackState[];
  /** Meta of the audible groove: in time and both travel the bar shows its real date */
  current?: VinylChunkMeta | null;
  onPlay: () => void;
  onPause: () => void;
  onRetry: () => void;
  onSeekToChunk: (k: number) => void;
  onVolumeChange: (v: number) => void;
  onShowTracks: () => void;
  onToggleTracks?: () => void;
  tracksExpanded?: boolean;
  tracksStatus?: 'loading' | 'ready' | 'error';
  tracksErrorKind?: string | null;
}

const SLIDER_DEBOUNCE_MS = 250;

function clock(s: number) {
  const total = Math.max(0, Math.floor(s));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Player bar of vinyl mode: play/pause, previous/next groove, a groove slider
 * (1-10) and the elapsed time of the side. Same look and keys as the zone
 * player bar; arrows and Home/End move between grooves.
 */
export function VinylPlayerBar({
  isPlaying,
  status,
  error,
  hasEnded,
  canPlay,
  chunkIndex,
  positionStore,
  totalSeconds,
  trackStates,
  current = null,
  onPlay,
  onPause,
  onRetry,
  onSeekToChunk,
  onVolumeChange,
  onShowTracks,
  onToggleTracks,
  tracksExpanded,
  tracksStatus = 'ready',
  tracksErrorKind = null,
}: VinylPlayerBarProps) {
  const { t, i18n } = useTranslation('player');
  // Whole seconds only: the bar re-renders once a second, not on every player tick
  const elapsedSeconds = usePlaybackPosition(positionStore, (p) => Math.floor(elapsedOf(p)));
  // Real date under the needle when the date moves (time and both travel): changes about every 3 s
  const dateKey = usePlaybackPosition(positionStore, (p) =>
    current && current.travel !== 'space' && p !== null
      ? periodAt(current, Math.max(0, elapsedOf(p) - current.chunkIndex * (totalSeconds / VINYL_CHUNKS)))
      : null
  );
  const dateLabel = dateKey ? formatMonthYear(periodToYear(dateKey), i18n.language) : null;
  const [volume, setVolume] = useState(0.5);
  const [isMuted, setIsMuted] = useState(false);
  const playButtonRef = useRef<HTMLButtonElement>(null);
  const isLoading = status === 'loading';
  const hasError = status === 'error' && error !== null;
  const enabledCount = trackStates.filter((s) => s.enabled).length;

  // Pausing is always allowed (WCAG 1.4.2), only starting can be blocked
  const playDisabledHint =
    tracksStatus === 'error'
      ? t(`common:errors.${tracksErrorKind ?? 'unknown'}`)
      : tracksStatus === 'loading'
        ? t('common:tracks.loading')
        : !canPlay
          ? t('noTrackHint')
          : null;
  const playPauseDisabled = !!playDisabledHint && !isPlaying;
  const [blockedNotice, setBlockedNotice] = useState('');

  const handlePlayPause = useCallback(() => {
    if (isPlaying) onPause();
    else if (!playDisabledHint) {
      setBlockedNotice('');
      onPlay();
    } else {
      setBlockedNotice('');
      window.setTimeout(() => setBlockedNotice(playDisabledHint), 50);
    }
  }, [isPlaying, playDisabledHint, onPlay, onPause]);

  const handleMuteToggle = useCallback(() => {
    const next = !isMuted;
    setIsMuted(next);
    onVolumeChange(next ? 0 : volume);
  }, [isMuted, volume, onVolumeChange]);

  const handleVolumeChange = useCallback(
    (v: number) => {
      setVolume(v);
      setIsMuted(v === 0);
      onVolumeChange(v);
    },
    [onVolumeChange]
  );

  // Groove slider: moves at once, the player is asked once the user settles
  const [draft, setDraft] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const changeGroove = (k: number) => {
    setDraft(k);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      setDraft(null);
      onSeekToChunk(k);
    }, SLIDER_DEBOUNCE_MS);
  };
  const shownIndex = draft ?? chunkIndex;

  usePlayerShortcuts({
    onPlayPause: handlePlayPause,
    onPrev: () => onSeekToChunk(chunkIndex - 1),
    onNext: () => onSeekToChunk(chunkIndex + 1),
    onFirst: () => onSeekToChunk(0),
    onLast: () => onSeekToChunk(VINYL_CHUNKS - 1),
    onMute: handleMuteToggle,
  });

  return (
    <div className="audio-player-enhanced vinyl-player">
      <div className="player-bar">
        {isLoading && <p className="player-message">{t('vinyl.loadingGroove', { k: chunkIndex + 1 })}</p>}
        {hasError && (
          <p className="player-message error" role="alert">
            <span>{t(`common:errors.${error.kind}`)}</span>
            <button
              type="button"
              className="player-retry"
              onClick={() => {
                playButtonRef.current?.focus();
                onRetry();
              }}
            >
              {t('retry')}
            </button>
          </p>
        )}
        {!isLoading && !hasError && hasEnded && <p className="player-message">{t('vinyl.ended')}</p>}
        {playPauseDisabled && playDisabledHint && (
          <p className="player-message">
            <span id="vinyl-play-disabled-hint">{playDisabledHint}</span>
            {!canPlay && tracksStatus === 'ready' && (
              <button type="button" className="player-link" onClick={onShowTracks}>
                {t('chooseSounds')}
              </button>
            )}
          </p>
        )}

        <div className="player-center">
          <button
            type="button"
            className="control-button skip-back"
            onClick={() => onSeekToChunk(chunkIndex - 1)}
            aria-label={t('vinyl.prevGroove')}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
            </svg>
          </button>
          <button
            type="button"
            ref={playButtonRef}
            className="control-button play-pause"
            onClick={handlePlayPause}
            aria-disabled={playPauseDisabled || undefined}
            aria-describedby={playPauseDisabled ? 'vinyl-play-disabled-hint' : undefined}
            aria-label={isPlaying ? t('vinyl.pause') : t('vinyl.play')}
          >
            {isPlaying ? (
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          <button
            type="button"
            className="control-button skip-forward"
            onClick={() => onSeekToChunk(chunkIndex + 1)}
            aria-label={t('vinyl.nextGroove')}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
            </svg>
          </button>
        </div>

        <div className="player-timeline vinyl-timeline">
          <label htmlFor="vinyl-groove-slider" className="vinyl-groove-label">
            {t('vinyl.grooveOf', { k: shownIndex + 1, n: VINYL_CHUNKS })}
          </label>
          <input
            id="vinyl-groove-slider"
            type="range"
            min={1}
            max={VINYL_CHUNKS}
            step={1}
            value={shownIndex + 1}
            aria-valuetext={
              t('vinyl.sliderValue', {
                k: shownIndex + 1,
                n: VINYL_CHUNKS,
                elapsed: clock(elapsedSeconds),
                total: clock(totalSeconds),
              }) + (dateLabel ? `, ${dateLabel}` : '')
            }
            onChange={(e) => changeGroove(Number(e.target.value) - 1)}
          />
          <span className="vinyl-clock" aria-hidden="true">
            {clock(elapsedSeconds)} / {clock(totalSeconds)}
          </span>
          {dateLabel && (
            // Not live: the date is announced once per groove (App), not every few seconds
            <span className="vinyl-date" data-testid="vinyl-date">
              {t('vinyl.currentDate', { date: dateLabel })}
            </span>
          )}
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
            className={`tracks-button${enabledCount === 0 ? ' empty' : ''}`}
            onClick={onToggleTracks ?? onShowTracks}
            aria-expanded={tracksExpanded}
            aria-label={t('controls.tracks', { count: enabledCount })}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
            </svg>
            <span className="tracks-label" aria-hidden="true">
              {t('controls.tracksShort')}
            </span>
            <span className="tracks-count" aria-hidden="true">
              {enabledCount}
            </span>
          </button>
        </div>

        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {blockedNotice || (hasError ? '' : hasEnded ? t('vinyl.ended') : '')}
        </div>
      </div>
    </div>
  );
}

export default VinylPlayerBar;
