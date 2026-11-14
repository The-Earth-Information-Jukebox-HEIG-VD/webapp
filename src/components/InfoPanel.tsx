import type { ClimateDataPoint } from '../types';
import './InfoPanel.css';

interface InfoPanelProps {
  dataPoint: ClimateDataPoint | null;
  datasetName: string;
  unit: string;
}

/**
 * InfoPanel - Display current data point information
 *
 * Shows the value and timestamp of the currently playing data point,
 * with appropriate formatting and accessibility labels.
 */
export function InfoPanel({ dataPoint, datasetName, unit }: InfoPanelProps) {
  if (!dataPoint) {
    return (
      <div className="info-panel">
        <p className="info-empty">No data loaded</p>
      </div>
    );
  }

  const value = dataPoint.anomaly ?? dataPoint.value;
  const isPositive = value >= 0;
  const formattedValue = value >= 0 ? `+${value.toFixed(2)}` : value.toFixed(2);
  const formattedDate = dataPoint.timestamp.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
  });

  return (
    <div className="info-panel" role="region" aria-label="Current data point">
      <h2 className="info-title">{datasetName}</h2>

      <div className="info-value-container">
        <span
          className={`info-value ${isPositive ? 'positive' : 'negative'}`}
          aria-label={`Temperature anomaly: ${formattedValue} ${unit}`}
        >
          {formattedValue}
        </span>
        <span className="info-unit">{unit}</span>
      </div>

      <div className="info-date">
        <span className="info-label">Date</span>
        <span className="info-date-value">{formattedDate}</span>
      </div>

      <div className="info-description">
        <p>
          {isPositive ? 'Above' : 'Below'} the 1951-1980 baseline average
        </p>
      </div>

      <div className="info-legend">
        <div className="legend-item">
          <span className="legend-color positive" aria-hidden="true" />
          <span>Warmer (higher pitch)</span>
        </div>
        <div className="legend-item">
          <span className="legend-color negative" aria-hidden="true" />
          <span>Cooler (lower pitch)</span>
        </div>
      </div>
    </div>
  );
}

export default InfoPanel;
