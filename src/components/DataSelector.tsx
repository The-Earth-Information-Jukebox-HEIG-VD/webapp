import type { DatasetType } from '../types';
import './DataSelector.css';

interface DataSelectorProps {
  selected: DatasetType;
  onChange: (dataset: DatasetType) => void;
}

interface DatasetOption {
  id: DatasetType;
  name: string;
  description: string;
  icon: string;
}

const DATASETS: DatasetOption[] = [
  {
    id: 'gistemp',
    name: 'Global Temperature',
    description: 'NASA GISTEMP surface temperature anomalies',
    icon: '🌡️',
  },
  {
    id: 'power',
    name: 'Regional Climate',
    description: 'NASA POWER API climate data by location',
    icon: '🌍',
  },
  {
    id: 'svs',
    name: 'Visualizations',
    description: 'NASA SVS Earth observation videos',
    icon: '🎬',
  },
];

/**
 * DataSelector - Choose which NASA dataset to sonify
 *
 * Provides a radio group with visual cards for each dataset option.
 */
export function DataSelector({ selected, onChange }: DataSelectorProps) {
  return (
    <fieldset className="data-selector">
      <legend className="selector-legend">Select Data Source</legend>

      <div className="selector-options" role="radiogroup">
        {DATASETS.map((dataset) => (
          <label
            key={dataset.id}
            className={`selector-option ${selected === dataset.id ? 'selected' : ''}`}
          >
            <input
              type="radio"
              name="dataset"
              value={dataset.id}
              checked={selected === dataset.id}
              onChange={() => onChange(dataset.id)}
              className="sr-only"
            />
            <span className="option-icon" aria-hidden="true">
              {dataset.icon}
            </span>
            <span className="option-content">
              <span className="option-name">{dataset.name}</span>
              <span className="option-description">{dataset.description}</span>
            </span>
            <span className="option-check" aria-hidden="true">
              {selected === dataset.id && '✓'}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default DataSelector;
