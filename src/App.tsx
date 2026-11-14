import { useState, useCallback, useMemo } from 'react';
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
import { ViewModeToggle, ZoneViewSelector } from './components/controls';

// Pages
import { AboutPage } from './components/about';
import { useHashRoute } from './hooks/useHashRoute';
import { getZoneDisplayName } from './utils/zoneName';

// Panel components
import { SlidingPanel, TrackSelector } from './components/panels';

// Player components
import { AudioPlayerEnhanced } from './components/player';

// Moments components
import { KeyMomentsSection } from './components/moments';

// Hooks
import { useSonification } from './hooks/useSonification';
import { useInstruments } from './hooks/useInstruments';
import { useZoneDataFrames } from './hooks/useZoneDataFrames';
import { monthKey } from './services/volumeData';
import { formatReading } from './utils/reading';

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
  const [isTrackPanelOpen, setIsTrackPanelOpen] = useState(false);

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
    chunkYear,
    currentYear,
    progress,
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
          <section className="player-section" aria-label={t('app.audioControls')}>
            <AudioPlayerEnhanced
              isPlaying={isPlaying}
              progress={progress}
              currentYear={currentYear}
              yearRange={yearRange}
              trackStates={trackStates}
              onPlay={handlePlay}
              onPause={pause}
              onSeek={seek}
              onSeekToYear={seekToYear}
              onVolumeChange={setVolume}
              onOpenTrackPanel={() => setIsTrackPanelOpen(true)}
              playDisabled={!selectedZone}
              status={status}
              error={error}
              hasEnded={hasEnded}
              canPlay={canPlay}
              onRetry={retry}
              tracksStatus={instruments.status}
              tracksErrorKind={instruments.errorKind}
            />
          </section>
        </main>

        <Footer />
      </div>

      {/* Track Selection Panel */}
      <SlidingPanel
        isOpen={isTrackPanelOpen}
        onClose={() => setIsTrackPanelOpen(false)}
        title={t('tracks.title')}
      >
        <TrackSelector
          tracks={tracks}
          trackStates={trackStates}
          status={instruments.status}
          errorKind={instruments.errorKind}
          preparing={instruments.preparing}
          onTrackToggle={setTrackEnabled}
          onRetry={instruments.reload}
        />
      </SlidingPanel>

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
