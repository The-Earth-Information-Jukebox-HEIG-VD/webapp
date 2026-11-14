import { useMemo, useState, useCallback, useRef } from 'react';
import type { ClimateDataPoint } from '../types';
import './DataVisualizer.css';

interface DataVisualizerProps {
  data: ClimateDataPoint[];
  currentIndex: number;
  unit: string;
  onBarSelect?: (index: number) => void;
}

/**
 * DataVisualizer - Visual representation of climate data
 *
 * Displays a bar chart of the data with the current position highlighted.
 * Syncs with audio playback to show which data point is being sonified.
 */
export function DataVisualizer({ data, currentIndex, unit, onBarSelect }: DataVisualizerProps) {
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const barsRef = useRef<(HTMLDivElement | null)[]>([]);

  const { bars, minValue, maxValue } = useMemo(() => {
    const values = data.map((d) => d.anomaly ?? d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const bars = data.map((point, index) => {
      const value = point.anomaly ?? point.value;
      const normalizedHeight = ((value - min) / range) * 100;
      const isPositive = value >= 0;

      return {
        index,
        value,
        height: normalizedHeight,
        isPositive,
        date: point.timestamp,
      };
    });

    return { bars, minValue: min, maxValue: max };
  }, [data]);

  const handleBarKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      let newIndex = index;

      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          newIndex = Math.max(0, index - 1);
          break;
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          newIndex = Math.min(data.length - 1, index + 1);
          break;
        case 'Home':
          e.preventDefault();
          newIndex = 0;
          break;
        case 'End':
          e.preventDefault();
          newIndex = data.length - 1;
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          onBarSelect?.(index);
          return;
        default:
          return;
      }

      if (newIndex !== index) {
        setFocusedIndex(newIndex);
        barsRef.current[newIndex]?.focus();
      }
    },
    [data.length, onBarSelect]
  );

  const handleBarClick = useCallback(
    (index: number) => {
      onBarSelect?.(index);
    },
    [onBarSelect]
  );

  if (data.length === 0) {
    return (
      <div className="data-visualizer">
        <p className="visualizer-empty">No data to display</p>
      </div>
    );
  }

  return (
    <div
      className="data-visualizer"
      role="img"
      aria-label={`Bar chart showing ${data.length} data points ranging from ${minValue.toFixed(2)} to ${maxValue.toFixed(2)} ${unit}`}
    >
      <div className="visualizer-header">
        <h3>Temperature Anomaly Timeline</h3>
        <div className="visualizer-range">
          <span>Min: {minValue.toFixed(2)}{unit}</span>
          <span>Max: {maxValue.toFixed(2)}{unit}</span>
        </div>
      </div>

      <div className="visualizer-chart">
        <div className="chart-baseline" aria-hidden="true" />

        <div
          className="chart-bars"
          role="listbox"
          aria-label="Temperature anomaly data points"
          aria-activedescendant={focusedIndex !== null ? `bar-${focusedIndex}` : undefined}
        >
          {bars.map((bar, i) => (
            <div
              key={bar.index}
              id={`bar-${bar.index}`}
              ref={(el) => { barsRef.current[i] = el; }}
              className={`chart-bar ${bar.isPositive ? 'positive' : 'negative'} ${
                bar.index === currentIndex ? 'active' : ''
              } ${focusedIndex === bar.index ? 'focused' : ''}`}
              style={{
                '--bar-height': `${Math.abs(bar.height)}%`,
              } as React.CSSProperties}
              role="option"
              aria-selected={bar.index === currentIndex}
              aria-label={`${bar.date.getFullYear()}: ${bar.value >= 0 ? '+' : ''}${bar.value.toFixed(2)}${unit}`}
              tabIndex={bar.index === (focusedIndex ?? 0) ? 0 : -1}
              onKeyDown={(e) => handleBarKeyDown(e, bar.index)}
              onClick={() => handleBarClick(bar.index)}
              onFocus={() => setFocusedIndex(bar.index)}
            >
              <span className="bar-fill" aria-hidden="true" />
            </div>
          ))}
        </div>
      </div>

      <div className="visualizer-footer">
        <span>
          {data[0]?.timestamp.getFullYear()} - {data[data.length - 1]?.timestamp.getFullYear()}
        </span>
      </div>

      {/* Hidden table for screen readers - provides full data access */}
      <table className="sr-only">
        <caption>Temperature Anomaly Data Table</caption>
        <thead>
          <tr>
            <th scope="col">Year</th>
            <th scope="col">Value ({unit})</th>
            <th scope="col">Trend</th>
          </tr>
        </thead>
        <tbody>
          {bars.map((bar) => (
            <tr key={bar.index}>
              <td>{bar.date.getFullYear()}</td>
              <td>{bar.value >= 0 ? '+' : ''}{bar.value.toFixed(2)}</td>
              <td>{bar.isPositive ? 'Above baseline (warmer)' : 'Below baseline (cooler)'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default DataVisualizer;
