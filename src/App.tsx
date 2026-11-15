import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

// Contexts
import { AccessibilityProvider, useAccessibility } from './contexts/AccessibilityContext';
import { ViewModeProvider, useViewMode } from './contexts/ViewModeContext';
import {
  ExperienceModeProvider,
  useExperienceMode,
  type ExperienceMode,
} from './contexts/ExperienceModeContext';

// Layout components
import { Header, Footer } from './components/layout';

// Visualization components
import { GlobeView, ListView, VinylGlobeView, VinylRecordView } from './components/visualization';
import type { GlobeMode } from './components/visualization/GlobeView';

// Control components
import {
  ViewModeToggle,
  ZoneViewSelector,
  TrackPanel,
  StyleSelector,
  ExperienceModeSwitch,
  VinylControls,
} from './components/controls';

// Pages
import { AboutPage } from './components/about';
import { useHashRoute } from './hooks/useHashRoute';
import { getZoneDisplayName } from './utils/zoneName';

// Player components
import { AudioPlayerEnhanced, VinylPlayerBar } from './components/player';
import { LiveSeriesChart, type ChartLine } from './components/player/SeriesChart';

// Moments components
import { KeyMomentsSection } from './components/moments';

// Hooks
import { useSonification } from './hooks/useSonification';
import { useInstruments } from './hooks/useInstruments';
import { useMusicStyle } from './hooks/useMusicStyle';
import { useZoneDataFrames } from './hooks/useZoneDataFrames';
import { useZoneSeries } from './hooks/useZoneSeries';
import { useLocalStorageBoolean } from './hooks/useLocalStorageBoolean';
import { usePlayerBarHeight } from './hooks/usePlayerBarHeight';
import { useVinylSettings } from './hooks/useVinylSettings';
import { useVinylSonification, VINYL_SIDE_SECONDS } from './hooks/useVinylSonification';
import { formatReading, isAnomalyUnits } from './utils/reading';
import { formatMonthYear } from './utils/formatDate';
import { periodToYear } from './services/sonificationApi';
import { formatLatLng, needlePoint, VINYL_CHUNKS } from './utils/vinylGeometry';
import { regionNameAt } from './utils/regionName';
import { presetForCenter } from './data/vinylPresets';
import { useHemisphereLabels } from './components/visualization/useHemisphereLabels';
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
  const { t, i18n } = useTranslation();
  const hemis = useHemisphereLabels();
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
  // Music style: shared by zone and vinyl mode (the instrument names depend on it)
  const musicStyle = useMusicStyle();
  const instruments = useInstruments(musicStyle.genre);
  const tracks = instruments.tracks;

  // Sonification hook
  const {
    isPlaying,
    status,
    error,
    hasEnded,
    interrupted,
    canPlay,
    positionStore,
    playbackMonthKey,
    mainTrackId,
    currentValue,
    units,
    isAnomaly,
    chunkValues,
    chunkYear,
    currentYear,
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
    genre: musicStyle.genre,
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
    month: playbackMonthKey,
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

  // ---- Vinyl mode: one month across the globe, played like a record --------
  // Same track selection as zone mode (TrackPanel stays wired to useSonification)
  const { mode, setMode } = useExperienceMode();
  const { preferences } = useAccessibility();
  const vinylSettings = useVinylSettings(tracks, enabledTrackIds);
  const vinyl = useVinylSonification({
    datasetIds: enabledIdList,
    center: vinylSettings.center,
    timePeriod: vinylSettings.timePeriod,
    travel: vinylSettings.travel,
    step: vinylSettings.step,
    genre: musicStyle.genre,
    rangeEnd: vinylSettings.range.end,
  });
  const vinylStarted = vinyl.current !== null || vinyl.isPlaying;
  const vinylMonthLabel = formatMonthYear(periodToYear(vinylSettings.timePeriod), i18n.language);
  const [modeNotice, setModeNotice] = useState('');

  // Only one player at a time: leaving a mode pauses its player
  const handleModeChange = useCallback(
    (next: ExperienceMode) => {
      if (next === mode) return;
      if (next === 'vinyl') {
        if (isPlaying) pause();
        setGlobeMode('select');
      } else if (vinyl.isPlaying) {
        vinyl.pause();
      }
      withViewTransition(() => setMode(next), { crossfadeOnly: true });
      setModeNotice(t(next === 'vinyl' ? 'experience.switchedVinyl' : 'experience.switchedZones'));
    },
    [mode, isPlaying, pause, vinyl, setMode, t]
  );
  // Also covers a mode restored from storage
  useEffect(() => {
    if (mode === 'vinyl' && isPlaying) pause();
    if (mode === 'zones' && vinyl.isPlaying) vinyl.pause();
    // Only when the mode changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Both players follow the same volume, so a mode switch keeps the level
  const setVolumeBoth = useCallback(
    (v: number) => {
      setVolume(v);
      vinyl.setVolume(v);
    },
    [setVolume, vinyl]
  );

  const vinylPlace = useCallback(
    (k: number) => {
      const p = needlePoint(vinylSettings.center, (k + 0.5) / VINYL_CHUNKS);
      return regionNameAt(p, t) ?? formatLatLng(p, i18n.language, hemis);
    },
    [vinylSettings.center, t, i18n.language, hemis]
  );
  const vinylReading = useMemo(() => {
    const id = enabledIdList.find((x) => vinyl.chunkValues[x] !== undefined);
    const tr = tracks.find((x) => x.id === id);
    if (!id || !tr) return null;
    return formatReading(vinyl.chunkValues[id], tr.units, isAnomalyUnits(tr.units), t, { speakable: true });
  }, [enabledIdList, vinyl.chunkValues, tracks, t]);
  const vinylCentreName = (() => {
    const preset = presetForCenter(vinylSettings.center);
    return preset ? t(`vinyl.presets.${preset.id}`) : formatLatLng(vinylSettings.center, i18n.language, hemis);
  })();

  // Datasets with a value in the audible chunk: the tracks actually sounding now
  const activeStatus = mode === 'vinyl' ? vinyl.status : status;
  const activeValues = mode === 'vinyl' ? vinyl.chunkValues : chunkValues;
  const soundingIds = useMemo(
    () => (activeStatus === 'playing' ? new Set(Object.keys(activeValues)) : new Set<string>()),
    [activeStatus, activeValues]
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
            {/* Time travel (zones) or Vinyl (one month across the globe) */}
            <ExperienceModeSwitch value={mode} onChange={handleModeChange} />
            <ViewModeToggle />
            {mode === 'zones' ? (
              /* Zone View Type Toggle */
              <ZoneViewSelector value={zoneViewType} onChange={setZoneViewType} />
            ) : (
              <VinylControls
                center={vinylSettings.center}
                onCenterChange={vinylSettings.setCenter}
                timePeriod={vinylSettings.timePeriod}
                onTimePeriodChange={vinylSettings.setTimePeriod}
                range={vinylSettings.range}
                clamped={vinylSettings.clamped}
                travel={vinylSettings.travel}
                onTravelChange={vinylSettings.setTravel}
                step={vinylSettings.step}
                onStepChange={vinylSettings.setStep}
              />
            )}
          </section>

          <div className={tracksOpen ? 'workspace' : 'workspace tracks-collapsed'}>
          {/* Track panel: always visible, beside (or above) the globe */}
          <aside id="tracks-section" className="tracks-section" aria-labelledby="track-panel-heading">
            <StyleSelector genres={musicStyle.genres} value={musicStyle.genre} onChange={musicStyle.setGenre} />
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
            {mode === 'vinyl' ? (
              viewMode === 'globe' ? (
                <VinylGlobeView
                  center={vinylSettings.center}
                  onCenterPick={vinylSettings.setCenter}
                  monthLabel={vinylMonthLabel}
                  chunkIndex={vinyl.chunkIndex}
                  started={vinylStarted}
                  isPlaying={vinyl.status === 'playing'}
                  getLiveProgress={vinyl.getLiveProgress}
                  history={vinyl.history}
                  tracks={tracks.filter((tr) => enabledTrackIds.has(tr.id))}
                  reducedMotion={preferences.reducedMotion}
                  travel={vinylSettings.travel}
                />
              ) : (
                <VinylRecordView
                  center={vinylSettings.center}
                  monthLabel={vinylMonthLabel}
                  chunkIndex={vinyl.chunkIndex}
                  started={vinylStarted}
                  history={vinyl.history}
                  tracks={tracks.filter((tr) => enabledTrackIds.has(tr.id))}
                  travel={vinylSettings.travel}
                />
              )
            ) : viewMode === 'globe' ? (
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

          {/* Key Moments Section (they jump the zone timeline: zone mode only) */}
          {mode === 'zones' && (
          <section className="moments-section">
            <KeyMomentsSection
              startYear={yearRange.start}
              endYear={yearRange.end}
              currentYear={currentYear}
              onJumpToMoment={handleJumpToMoment}
            />
          </section>
          )}
          </>
          )}

          {/* Player stays on every page so audio can always be paused (WCAG 1.4.2) */}
          {/* Audio Player (Sticky) */}
          <section className="player-section" ref={playerRef} aria-label={t('app.audioControls')}>
            {mode === 'vinyl' ? (
              <VinylPlayerBar
                isPlaying={vinyl.isPlaying}
                status={vinyl.status}
                error={vinyl.error}
                hasEnded={vinyl.hasEnded}
                canPlay={vinyl.canPlay}
                chunkIndex={vinyl.chunkIndex}
                positionStore={vinyl.positionStore}
                totalSeconds={VINYL_SIDE_SECONDS}
                trackStates={trackStates}
                current={vinyl.current}
                onPlay={vinyl.play}
                onPause={vinyl.pause}
                onRetry={vinyl.retry}
                onSeekToChunk={vinyl.seekToChunk}
                onVolumeChange={setVolumeBoth}
                onShowTracks={focusTrackPanel}
                onToggleTracks={toggleTrackPanel}
                tracksExpanded={tracksExpanded}
                tracksStatus={instruments.status}
                tracksErrorKind={instruments.errorKind}
              />
            ) : (
            <AudioPlayerEnhanced
              isPlaying={isPlaying}
              currentYear={currentYear}
              positionStore={positionStore}
              timelineEnd={timelineEnd}
              yearRange={yearRange}
              trackStates={trackStates}
              onPlay={handlePlay}
              onPause={pause}
              onSeek={seek}
              onSeekToYear={seekToYear}
              onVolumeChange={setVolumeBoth}
              onShowTracks={focusTrackPanel}
              onToggleTracks={toggleTrackPanel}
              tracksExpanded={tracksExpanded}
              playDisabled={!selectedZone}
              status={status}
              error={error}
              hasEnded={hasEnded}
              interrupted={interrupted}
              canPlay={canPlay}
              onRetry={retry}
              tracksStatus={instruments.status}
              tracksErrorKind={instruments.errorKind}
              graph={{
                on: graphOn,
                onToggle: () => setGraphOn(!graphOn),
                content: ({ hoverFraction, onHoverChange }) => (
                  <LiveSeriesChart
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
                    positionStore={positionStore}
                    hoverFraction={hoverFraction}
                    onHoverChange={onHoverChange}
                    onSeek={seek}
                  />
                ),
              }}
            />
            )}
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
        {mode === 'zones' && isPlaying && reading && chunkYear !== null && (
          t('player:announcements.nowPlaying', { reading, year: chunkYear })
        )}
        {mode === 'vinyl' && vinyl.isPlaying && vinyl.current && (
          t(
            vinyl.current.travel === 'space'
              ? vinylReading
                ? 'vinyl.nowPlaying'
                : 'vinyl.nowPlayingNoValue'
              : vinylReading
                ? 'vinyl.nowPlayingDate'
                : 'vinyl.nowPlayingDateNoValue',
            {
              k: vinyl.current.chunkIndex + 1,
              n: VINYL_CHUNKS,
              // time and both: the real date of the groove
              date: formatMonthYear(periodToYear(vinyl.current.periods[0] ?? vinyl.current.timePeriod), i18n.language),
              place:
                vinyl.current.travel === 'time' ? vinylCentreName : vinylPlace(vinyl.current.chunkIndex),
              reading: vinylReading,
            }
          )
        )}
      </div>

      {/* Announce the selected zone (zones) or the record's centre and month (vinyl) */}
      <div className="sr-only" role="status" aria-live="polite">
        {mode === 'zones'
          ? selectedZone && selectedPoints.length > 0 &&
            t('zones.zoneSelected', { zone: getZoneDisplayName(selectedZone, t) })
          : t('vinyl.centred', { place: vinylCentreName, month: vinylMonthLabel })}
      </div>

      {/* Mode switch announcement */}
      <div className="sr-only" role="status" aria-live="polite">
        {modeNotice}
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
        <ExperienceModeProvider>
          <AppContent />
        </ExperienceModeProvider>
      </ViewModeProvider>
    </AccessibilityProvider>
  );
}

export default App;
