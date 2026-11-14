import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

// Contexts
import { AccessibilityProvider } from './contexts/AccessibilityContext';
import { ViewModeProvider, useViewMode } from './contexts/ViewModeContext';

// Layout components
import { Header, Footer } from './components/layout';

// Visualization components
import { GlobeView, ListView } from './components/visualization';

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

// Types
import type { ClimateDataset } from './types';
import type { ZoneViewType, GridPoint } from './types/zones';

// Data
import { DEFAULT_ZONE_ID } from './data/zones';

import './App.css';

// Extended sample data for demo (1880-2024)
const SAMPLE_DATA: ClimateDataset = {
  id: 'gistemp-global',
  name: 'Global Temperature Anomalies',
  source: 'NASA GISTEMP',
  unit: '°C',
  description: 'Global surface temperature anomalies relative to 1951-1980 baseline',
  points: generateSampleData(),
};

// Generate sample data from 1880 to 2024
function generateSampleData() {
  const points = [];
  for (let year = 1880; year <= 2024; year++) {
    // Simulate realistic temperature anomaly progression
    const baseAnomaly = -0.2 + ((year - 1880) / 144) * 1.6;
    const noise = Math.sin(year * 0.5) * 0.15 + Math.cos(year * 0.3) * 0.1;
    const anomaly = baseAnomaly + noise;

    points.push({
      timestamp: new Date(`${year}-01-01`),
      value: anomaly,
      anomaly: anomaly,
    });
  }
  return points;
}

/**
 * Main Application Component
 *
 * Integrates all features:
 * - Internationalized UI (EN/FR/DE)
 * - Globe or List visualization with zone selection
 * - Multi-track audio sonification (9 NASA SVS datasets)
 * - Enhanced player with timeline
 * - Key climate moments
 * - Full accessibility support (always enabled)
 */
function AppContent() {
  const { t } = useTranslation();
  const { viewMode } = useViewMode();
  const route = useHashRoute();

  // State
  const [dataset] = useState<ClimateDataset>(SAMPLE_DATA);
  const [selectedZone, setSelectedZone] = useState<string | null>(DEFAULT_ZONE_ID);
  const [zoneViewType, setZoneViewType] = useState<ZoneViewType>('continent');
  const [selectedPoints, setSelectedPoints] = useState<GridPoint[]>([]);
  const [isTrackPanelOpen, setIsTrackPanelOpen] = useState(false);

  // Sonification hook
  const {
    isPlaying,
    currentYear,
    progress,
    yearRange,
    trackStates,
    play,
    pause,
    seek,
    seekToYear,
    setVolume,
    setTrackEnabled,
    setTrackVolume,
  } = useSonification(dataset);

  // Handlers
  const handleZoneSelect = useCallback((zoneId: string, points: GridPoint[]) => {
    setSelectedZone(zoneId);
    setSelectedPoints(points);
    // In production, this would trigger data fetching from backend
    // using the points array to extract zone-specific data
    console.log(`Selected zone: ${zoneId}, points: ${points.length}`);
  }, []);

  const handleJumpToMoment = useCallback((year: number) => {
    seekToYear(year);
  }, [seekToYear]);

  // Create anomaly data map for visualization
  // Memoized on the current data point (not on `progress`, which ticks many times
  // per second during playback) so the globe only receives a new Map when the
  // underlying value actually changes.
  const currentIndex = Math.floor(progress * dataset.points.length);
  const currentPoint = dataset.points[currentIndex];
  const anomalyData = useMemo(() => {
    const map = new Map<string, number>();
    if (currentPoint) {
      // In production, would have per-zone data from backend
      // For demo, simulate zone-specific anomalies
      const base = currentPoint.anomaly ?? currentPoint.value;
      map.set('africa', base);
      map.set('antarctica', base * 1.5);
      map.set('asia', base * 0.9);
      map.set('europe', base * 1.1);
      map.set('northAmerica', base * 0.95);
      map.set('oceania', base * 0.8);
      map.set('southAmerica', base * 0.85);
    }
    return map;
  }, [currentPoint]);

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
                anomalyData={anomalyData}
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
              onPlay={play}
              onPause={pause}
              onSeek={seek}
              onSeekToYear={seekToYear}
              onVolumeChange={setVolume}
              onOpenTrackPanel={() => setIsTrackPanelOpen(true)}
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
          trackStates={trackStates}
          onTrackToggle={setTrackEnabled}
          onTrackVolumeChange={setTrackVolume}
        />
      </SlidingPanel>

      {/* Live region for screen reader announcements */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {isPlaying && currentPoint && (
          t('player:announcements.nowPlaying', {
            value: currentPoint.value.toFixed(2),
            year: currentYear,
          })
        )}
      </div>

      {/* Announce selected zone and points for debugging/accessibility */}
      <div className="sr-only" role="status" aria-live="polite">
        {selectedZone && selectedPoints.length > 0 && (
          t('zones.pointsSelected', {
            zone: getZoneDisplayName(selectedZone, t),
            count: selectedPoints.length,
          })
        )}
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
