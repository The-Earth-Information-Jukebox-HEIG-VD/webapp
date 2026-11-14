import { useState } from 'react'
import { AudioPlayer } from './components/AudioPlayer'
import { DataSelector } from './components/DataSelector'
import { InfoPanel } from './components/InfoPanel'
import { DataVisualizer } from './components/DataVisualizer'
import { useSonification } from './hooks/useSonification'
import type { ClimateDataset, DatasetType } from './types'
import './App.css'

// Sample data for demo - in production, fetch from backend
const SAMPLE_DATA: ClimateDataset = {
  id: 'gistemp-global',
  name: 'Global Temperature Anomalies',
  source: 'NASA GISTEMP',
  unit: '°C',
  description: 'Global surface temperature anomalies relative to 1951-1980 baseline',
  points: [
    { timestamp: new Date('2020-01-01'), value: 1.17, anomaly: 1.17 },
    { timestamp: new Date('2020-06-01'), value: 1.02, anomaly: 1.02 },
    { timestamp: new Date('2021-01-01'), value: 1.12, anomaly: 1.12 },
    { timestamp: new Date('2021-06-01'), value: 0.88, anomaly: 0.88 },
    { timestamp: new Date('2022-01-01'), value: 1.01, anomaly: 1.01 },
    { timestamp: new Date('2022-06-01'), value: 0.94, anomaly: 0.94 },
    { timestamp: new Date('2023-01-01'), value: 1.12, anomaly: 1.12 },
    { timestamp: new Date('2023-06-01'), value: 1.18, anomaly: 1.18 },
    { timestamp: new Date('2024-01-01'), value: 1.54, anomaly: 1.54 },
    { timestamp: new Date('2024-06-01'), value: 1.46, anomaly: 1.46 },
  ],
}

function App() {
  const [selectedDataset, setSelectedDataset] = useState<DatasetType>('gistemp')
  const [dataset] = useState<ClimateDataset>(SAMPLE_DATA)

  const {
    isPlaying,
    currentIndex,
    progress,
    play,
    pause,
    stop,
    seek,
  } = useSonification(dataset)

  const currentDataPoint = dataset.points[currentIndex] || dataset.points[0]

  const handleDatasetChange = (type: DatasetType) => {
    stop()
    setSelectedDataset(type)
    // In production, fetch new dataset from backend
  }

  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <div className="app">
        <header className="app-header">
          <h1>Earth Information Jukebox</h1>
          <p className="subtitle">Hear the story of our changing climate</p>
        </header>

        <main id="main-content" className="app-main">
          <section className="control-section" aria-label="Data selection">
            <DataSelector
              selected={selectedDataset}
              onChange={handleDatasetChange}
            />
          </section>

          <section className="visualization-section" aria-label="Data visualization">
            <DataVisualizer
              data={dataset.points}
              currentIndex={currentIndex}
              unit={dataset.unit}
            />
          </section>

          <section className="info-section" aria-label="Current data point">
            <InfoPanel
              dataPoint={currentDataPoint}
              datasetName={dataset.name}
              unit={dataset.unit}
            />
          </section>

          <section className="player-section" aria-label="Audio controls">
            <AudioPlayer
              isPlaying={isPlaying}
              progress={progress}
              onPlay={play}
              onPause={pause}
              onStop={stop}
              onSeek={seek}
              datasetName={dataset.name}
            />
          </section>
        </main>

        <footer className="app-footer">
          <p>
            NASA Space Apps Challenge 2026 | Data: NASA GISTEMP, POWER API
          </p>
        </footer>
      </div>

      {/* Live region for screen reader announcements */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {isPlaying && currentDataPoint && (
          `Now playing: ${currentDataPoint.value.toFixed(2)}${dataset.unit} anomaly for ${currentDataPoint.timestamp.toLocaleDateString()}`
        )}
      </div>
    </>
  )
}

export default App
