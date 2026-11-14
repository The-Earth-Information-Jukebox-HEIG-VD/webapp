import { useState, useMemo } from 'react';
import type { ClimateDataPoint, SonificationConfig } from '../types';
import './AudioTranscript.css';

interface AudioTranscriptProps {
  data: ClimateDataPoint[];
  config: SonificationConfig;
  unit: string;
  datasetName: string;
}

/**
 * AudioTranscript - Text alternative for sonified audio
 *
 * Provides a collapsible panel with:
 * 1. Description of how data maps to sound
 * 2. Complete data table with sound descriptions
 *
 * Essential for users who are deaf or hard of hearing.
 */
export function AudioTranscript({
  data,
  config,
  unit,
  datasetName,
}: AudioTranscriptProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const tableData = useMemo(() => {
    if (data.length === 0) return [];

    const values = data.map((d) => d.anomaly ?? d.value);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const range = maxValue - minValue || 1;

    return data.map((point, index) => {
      const value = point.anomaly ?? point.value;
      const normalized = (value - minValue) / range;
      const frequency = config.minFrequency + normalized * (config.maxFrequency - config.minFrequency);

      // Describe the pitch in musical/relative terms
      let pitchDescription: string;
      if (normalized < 0.2) {
        pitchDescription = 'Very low pitch';
      } else if (normalized < 0.4) {
        pitchDescription = 'Low pitch';
      } else if (normalized < 0.6) {
        pitchDescription = 'Medium pitch';
      } else if (normalized < 0.8) {
        pitchDescription = 'High pitch';
      } else {
        pitchDescription = 'Very high pitch';
      }

      return {
        index,
        year: point.timestamp.getFullYear(),
        value,
        frequency: Math.round(frequency),
        pitchDescription,
        trend: value >= 0 ? 'Above baseline' : 'Below baseline',
      };
    });
  }, [data, config.minFrequency, config.maxFrequency]);

  if (data.length === 0) return null;

  return (
    <div className="audio-transcript">
      <button
        className="transcript-toggle"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        aria-controls="transcript-content"
      >
        <span className="toggle-icon" aria-hidden="true">
          {isExpanded ? '▼' : '▶'}
        </span>
        <span>Audio Transcript & Data Table</span>
        <span className="sr-only">
          {isExpanded ? '(expanded)' : '(collapsed)'}
        </span>
      </button>

      <div
        id="transcript-content"
        className={`transcript-content ${isExpanded ? 'expanded' : ''}`}
        hidden={!isExpanded}
      >
        <section className="transcript-description">
          <h3>How to Interpret the Sonification</h3>
          <p>
            This sonification converts {datasetName} data into sound. The mapping works as follows:
          </p>
          <ul>
            <li>
              <strong>Pitch (frequency):</strong> Higher values produce higher-pitched tones.
              The frequency ranges from {config.minFrequency} Hz (lowest data value) to{' '}
              {config.maxFrequency} Hz (highest data value).
            </li>
            <li>
              <strong>Time:</strong> Each data point plays for {config.noteDuration}ms, proceeding
              chronologically from oldest to newest.
            </li>
            <li>
              <strong>Temperature interpretation:</strong> Higher pitches indicate warmer years
              (positive temperature anomalies), while lower pitches indicate cooler years
              (negative anomalies).
            </li>
          </ul>
          <p>
            <strong>Waveform:</strong> {config.waveform} wave
          </p>
        </section>

        <section className="transcript-data">
          <h3>Complete Data Table</h3>
          <p className="data-summary">
            {data.length} data points from {data[0]?.timestamp.getFullYear()} to{' '}
            {data[data.length - 1]?.timestamp.getFullYear()}
          </p>

          <div className="table-container" role="region" aria-label="Scrollable data table">
            <table>
              <caption className="sr-only">
                {datasetName} data with corresponding sound frequencies
              </caption>
              <thead>
                <tr>
                  <th scope="col">Year</th>
                  <th scope="col">Value ({unit})</th>
                  <th scope="col">Frequency (Hz)</th>
                  <th scope="col">Sound Description</th>
                  <th scope="col">Trend</th>
                </tr>
              </thead>
              <tbody>
                {tableData.map((row) => (
                  <tr key={row.index}>
                    <td>{row.year}</td>
                    <td>
                      {row.value >= 0 ? '+' : ''}
                      {row.value.toFixed(2)}
                    </td>
                    <td>{row.frequency}</td>
                    <td>{row.pitchDescription}</td>
                    <td>{row.trend}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

export default AudioTranscript;
