import { useState, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

// Contexts
import { AccessibilityProvider } from './contexts/AccessibilityContext';
import { ViewModeProvider, useViewMode } from './contexts/ViewModeContext';

// Layout components
import { Header, Footer } from './components/layout';

// Visualization components
import { GlobeView, ListView } from './components/visualization';
import type { GlobeMode } from './components/visualization/GlobeView';

// Control components
import { ViewModeToggle, ZoneViewSelector, TrackPanel } from './components/controls';

// Pages
import { AboutPage } from './components/about';
import { useHashRoute } from './hooks/useHashRoute';
import { getZoneDisplayName } from './utils/zoneName';

// Player components
import { AudioPlayerEnhanced } from './components/player';
import { SeriesChart, type ChartLine } from './components/player/SeriesChart';

// Moments components
import { KeyMomentsSection } from './components/moments';

// Hooks
import { useSonification } from './hooks/useSonification';
import { useInstruments } from './hooks/useInstruments';
import { useZoneDataFrames } from './hooks/useZoneDataFrames';
import { useZoneSeries } from './hooks/useZoneSeries';
import { useLocalStorageBoolean } from './hooks/useLocalStorageBoolean';
import { usePlayerBarHeight } from './hooks/usePlayerBarHeight';
import { monthKey } from './services/volumeData';
import { formatReading } from './utils/reading';
import { withViewTransition, prefersReducedMotion } from './utils/motion';

// Types
import type { ZoneViewType, GridPoint } from './types/zones';

// Data
import { findZoneFeature } from './data/zones';

import './App.css';

/**
 * Main Application Component
 *
 * Integrates all features:
 * - Internationalized UI (EN/FR/DE)
 * - Globe or List visualization with zone selection
 * - Multi-track audio sonification (NASA datasets)
 * - Enhanced player with timeline
 * - Key climate moments
 * - Full accessibility support (always enabled)
 */
function AppContent() {
  const { t } = useTranslation();
  const { viewMode } = useViewMode();
  const route = useHashRoute();

  // State
  // No zone at start: Play stays disabled until the user picks one
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  // 'playback': zone polygons hidden, the zone's volume data drawn on the globe
  const [globeMode, setGlobeMode] = useState<GlobeMode>('select');
  const [zoneViewType, setZoneViewType] = useState<ZoneViewType>('continent');
  const [selectedPoints, setSelectedPoints] = useState<GridPoint[]>([]);
  // "What do you want to hear?" panel shown or collapsed (remembered per browser)
  const [tracksOpen, setTracksOpenState] = useLocalStorageBoolean('earth-jukebox-tracks-open', true);
  // Collapsing/expanding re-lays out the workspace: a brief, still cross-fade
  // (morphing the panel and globe to their new boxes moved too much)
  const setTracksOpen = useCallback(
    (open: boolean) => withViewTransition(() => setTracksOpenState(open), { crossfadeOnly: true }),
    [setTracksOpenState]
  );

  // Tracks come from the backend's /api/instruments
  const instruments = useInstruments();
  const tracks = instruments.tracks;

  // Sonification hook
  const {
    isPlaying,
    status,
    error,
    hasEnded,
    canPlay,
    position,
    mainTrackId,
    currentValue,
    units,
    isAnomaly,
    chunkValues,
    chunkYear,
    currentYear,
    progress,
    timelineEnd,
    yearRange,
    trackStates,
    play,
    pause,
    retry,
    seek,
    seekToYear,
    setVolume,
    setTrackEnabled,
  } = useSonification({
    tracks,
    points: selectedPoints,
    zoneId: selectedZone,
    zoneName: selectedZone ? getZoneDisplayName(selectedZone, t) : null,
  });

  // Handlers
  const handleZoneSelect = useCallback((zoneId: string, points: GridPoint[]) => {
    setSelectedZone(zoneId);
    setSelectedPoints(points);
  }, []);

  const handlePlay = useCallback(() => {
    if (!selectedZone) return;
    setGlobeMode('playback');
    play();
  }, [selectedZone, play]);

  const handleBackToSelection = useCallback(() => {
    pause();
    setGlobeMode('select');
  }, [pause]);

  // Volume data of the selected zone, month by month in step with the music
  const playbackYear = Math.floor(position);
  const playbackMonth = Math.min(12, Math.floor((position % 1) * 12) + 1);
  const selectedFeature = useMemo(
    () => (selectedZone ? findZoneFeature(selectedZone) ?? null : null),
    [selectedZone]
  );
  // The globe shows the same datasets as the audio: the tracks selected in the track panel
  const enabledTrackIds = useMemo(
    () => new Set(trackStates.filter((s) => s.enabled).map((s) => s.id)),
    [trackStates]
  );
  const zoneData = useZoneDataFrames({
    feature: selectedFeature,
    month: monthKey(playbackYear, playbackMonth),
    active: globeMode === 'playback' && viewMode === 'globe',
    enabledTrackIds,
  });

  // Data graph above the timeline: one line per enabled track, for the selected area
  const [graphOn, setGraphOn] = useLocalStorageBoolean('earth-jukebox-player-graph', false);
  const enabledIdList = useMemo(
    () => trackStates.filter((s) => s.enabled).map((s) => s.id),
    [trackStates]
  );
  const zoneName = selectedZone ? getZoneDisplayName(selectedZone, t) : null;
  const zoneSeries = useZoneSeries({
    zoneId: selectedZone,
    zoneName,
    points: selectedPoints,
    datasetIds: enabledIdList,
    active: graphOn,
  });
  const chartLines = useMemo<ChartLine[]>(
    () =>
      tracks.flatMap((tr) => {
        const series = enabledTrackIds.has(tr.id) ? zoneSeries.series[tr.id] : undefined;
        return series
          ? [{ id: tr.id, name: t(tr.nameKey, { defaultValue: tr.label }), color: tr.color, series }]
          : [];
      }),
    [tracks, enabledTrackIds, zoneSeries.series, t]
  );
  const playerRef = useRef<HTMLElement>(null);
  usePlayerBarHeight(playerRef);

  // Datasets with a value in the audible chunk: the tracks actually sounding now
  const soundingIds = useMemo(
    () => (status === 'playing' ? new Set(Object.keys(chunkValues)) : new Set<string>()),
    [status, chunkValues]
  );

  // "Sounds" button / "Choose sounds" link: bring the first track row into view and focus it
  const focusTrackPanel = useCallback(() => {
    // The rows only exist while the panel is open; the retry loop below waits for them
    setTracksOpen(true);
    const focusRow = (attempt = 0) => {
      // Fall back to the panel root (tabIndex -1): the <aside> itself is not focusable
      const target =
        document.querySelector<HTMLElement>('#track-panel-body:not([hidden]) [data-track-row]') ??
        document.querySelector<HTMLElement>('#tracks-section [tabindex="-1"]');
      if (!target) {
        // Coming from the About route the home page may not be rendered yet
        if (attempt < 10) window.setTimeout(() => focusRow(attempt + 1), 50);
        return;
      }
      target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
      target.focus({ preventScroll: true });
    };
    if (window.location.hash === '#about') {
      window.location.hash = '#';
      window.setTimeout(() => focusRow(), 50);
    } else {
      focusRow();
    }
  }, [setTracksOpen]);

  // "Sounds" button: show/hide the track panel. On the About page the panel is not
  // rendered, so the button always brings it back (and focuses it) there.
  const tracksExpanded = route !== 'about' && tracksOpen;
  const toggleTrackPanel = useCallback(() => {
    if (tracksExpanded) setTracksOpen(false);
    else focusTrackPanel();
  }, [tracksExpanded, setTracksOpen, focusTrackPanel]);

  const handleJumpToMoment = useCallback((year: number) => {
    seekToYear(year);
  }, [seekToYear]);

  // Backend value of the current chunk, e.g. "+1.2 °C vs normal" (screen reader announcement)
  // With several tracks, name the track the value belongs to (the first enabled one with a value)
  const enabledTracks = tracks.filter((tr) => trackStates.some((s) => s.id === tr.id && s.enabled));
  const mainTrack = tracks.find((tr) => tr.id === mainTrackId);
  const readingText =
    currentValue !== null
      ? formatReading(currentValue, units, isAnomaly, t, { speakable: true })
      : null;
  const reading =
    readingText && mainTrack && enabledTracks.length > 1
      ? `${t(mainTrack.nameKey, { defaultValue: mainTrack.label })}: ${readingText}`
      : readingText;

  return (
    <>
      <a href="#main-content" className="skip-link">
        {t('app.skipToContent')}
      </a>

      <div className="app">
        <Header />

        <main id="main-content" className="app-main">
          {route === 'about' ? (
            <AboutPage />
          ) : (
          <>
          {/* View Mode Toggle */}
          <section className="datetime-section">
            <ViewModeToggle />
            {/* Zone View Type Toggle */}
            <ZoneViewSelector value={zoneViewType} onChange={setZoneViewType} />
          </section>

          <div className={tracksOpen ? 'workspace' : 'workspace tracks-collapsed'}>
          {/* Track panel: always visible, beside (or above) the globe */}
          <aside id="tracks-section" className="tracks-section" aria-labelledby="track-panel-heading">
            <TrackPanel
              tracks={tracks}
              trackStates={trackStates}
              status={instruments.status}
              errorKind={instruments.errorKind}
              preparing={instruments.preparing}
              onTrackToggle={setTrackEnabled}
              onRetry={instruments.reload}
              soundingIds={soundingIds}
              open={tracksOpen}
              onOpenChange={setTracksOpen}
            />
          </aside>

          {/* Visualization Section */}
          <section className="visualization-section" aria-label={t('app.climateVisualization')}>
            {viewMode === 'globe' ? (
              <GlobeView
                selectedZone={selectedZone}
                onZoneSelect={handleZoneSelect}
                zoneViewType={zoneViewType}
                currentYear={currentYear}
                mode={globeMode}
                zoneData={zoneData}
                onBackToSelection={handleBackToSelection}
                tracks={tracks}
                enabledTrackIds={enabledTrackIds}
                soundingIds={soundingIds}
              />
            ) : (
              <ListView
                selectedZone={selectedZone}
                onZoneSelect={handleZoneSelect}
                zoneViewType={zoneViewType}
                currentYear={currentYear}
              />
            )}
          </section>
          </div>

          {/* Key Moments Section */}
          <section className="moments-section">
            <KeyMomentsSection
              startYear={yearRange.start}
              endYear={yearRange.end}
              currentYear={currentYear}
              onJumpToMoment={handleJumpToMoment}
            />
          </section>
          </>
          )}

          {/* Player stays on every page so audio can always be paused (WCAG 1.4.2) */}
          {/* Audio Player (Sticky) */}
          <section className="player-section" ref={playerRef} aria-label={t('app.audioControls')}>
            <AudioPlayerEnhanced
              isPlaying={isPlaying}
              progress={progress}
              currentYear={currentYear}
              position={position}
              timelineEnd={timelineEnd}
              yearRange={yearRange}
              trackStates={trackStates}
              onPlay={handlePlay}
              onPause={pause}
              onSeek={seek}
              onSeekToYear={seekToYear}
              onVolumeChange={setVolume}
              onShowTracks={focusTrackPanel}
              onToggleTracks={toggleTrackPanel}
              tracksExpanded={tracksExpanded}
              playDisabled={!selectedZone}
              status={status}
              error={error}
              hasEnded={hasEnded}
              canPlay={canPlay}
              onRetry={retry}
              tracksStatus={instruments.status}
              tracksErrorKind={instruments.errorKind}
              graph={{
                on: graphOn,
                onToggle: () => setGraphOn(!graphOn),
                content: ({ hoverFraction, onHoverChange }) => (
                  <SeriesChart
                    lines={chartLines}
                    status={
                      !selectedZone || enabledIdList.length === 0 ? 'idle' : zoneSeries.status
                    }
                    errorKind={zoneSeries.errorKind}
                    onRetry={zoneSeries.retry}
                    zoneName={zoneName}
                    startYear={yearRange.start}
                    endYear={yearRange.end}
                    timelineEnd={timelineEnd}
                    position={position}
                    hoverFraction={hoverFraction}
                    onHoverChange={onHoverChange}
                    onSeek={seek}
                  />
                ),
              }}
            />
          </section>
        </main>

        <Footer />
      </div>

      {/* Live region for screen reader announcements */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {isPlaying && reading && chunkYear !== null && (
          t('player:announcements.nowPlaying', { reading, year: chunkYear })
        )}
      </div>

      {/* Announce the selected zone */}
      <div className="sr-only" role="status" aria-live="polite">
        {selectedZone && selectedPoints.length > 0 &&
          t('zones.zoneSelected', { zone: getZoneDisplayName(selectedZone, t) })}
      </div>
    </>
  );
}

/**
 * App wrapper with providers
 */
function App() {
  return (
    <AccessibilityProvider>
      <ViewModeProvider>
        <AppContent />
      </ViewModeProvider>
    </AccessibilityProvider>
  );
}

export default App;
