import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'jest-axe';
import '../../i18n';
import { GlobeView } from './GlobeView';
import { KNOWN_DATASETS } from '../../data/datasetRegistry';
import type { ZoneDataFrames } from '../../hooks/useZoneDataFrames';
import type { VolumeDataset } from '../../services/volumeData';

// WebGL is not available in jsdom: capture the props given to the globe instead
let globeProps: Record<string, unknown> = {};
vi.mock('react-globe.gl', () => ({
  default: (props: Record<string, unknown>) => {
    globeProps = props;
    return <div data-testid="globe" />;
  },
}));

const [temperature, co2] = KNOWN_DATASETS;
const datasets: VolumeDataset[] = [temperature, co2].map((info) => ({
  info,
  months: ['2010_07'],
  monthSet: new Set(['2010_07']),
}));

const zoneData: ZoneDataFrames = {
  status: 'ready',
  error: null,
  datasets,
  grid: {
    stride: 1,
    rowMin: 174,
    rowMax: 174,
    rowRuns: [[174, 174]],
    cells: [
      { row: 174, col: 746, lat: 46.375, lng: 6.625 },
      { row: 174, col: 747, lat: 46.375, lng: 6.875 },
    ],
  },
  month: '2010_07',
  frame: new Map([
    ['temperature_anomaly', new Float32Array([2.5703125, NaN])],
    ['co2', null], // month not covered by this dataset
  ]),
};

const baseProps = {
  selectedZone: 'switzerland',
  onZoneSelect: vi.fn(),
  zoneViewType: 'country' as const,
  currentYear: 2010,
};

describe('GlobeView playback mode', () => {
  beforeEach(() => {
    globeProps = {};
  });

  it('shows zone polygons and no data dots in select mode', () => {
    render(<GlobeView {...baseProps} mode="select" />);
    expect((globeProps.polygonsData as object[]).length).toBeGreaterThan(0);
    expect(globeProps.pointsData).toEqual([]);
    expect(screen.queryByRole('button', { name: /change zone/i })).not.toBeInTheDocument();
  });

  it('removes the zone polygons and draws the stored values as dots', () => {
    render(<GlobeView {...baseProps} mode="playback" zoneData={zoneData} onBackToSelection={vi.fn()} />);
    expect(globeProps.polygonsData).toEqual([]);
    // Only the non-NaN temperature cell is drawn; CO2 has no data this month
    const dots = globeProps.pointsData as { dataset: number; cell: number }[];
    expect(dots).toHaveLength(1);
    expect(dots[0]).toMatchObject({ dataset: 0, cell: 0 });
    const color = (globeProps.pointColor as (d: object) => string)(dots[0]);
    expect(color).toMatch(/^rgba\(255, 90, 54, /); // temperature color
  });

  it('lists every dataset with its stored values in the legend and data table (accessibility)', async () => {
    const { container } = render(
      <GlobeView {...baseProps} mode="playback" zoneData={zoneData} onBackToSelection={vi.fn()} />
    );
    const legend = screen.getByRole('region', { name: 'Datasets' });
    expect(legend).toHaveTextContent('Temperature anomaly');
    expect(legend).toHaveTextContent('2.57 to 2.57 °C');
    expect(legend).toHaveTextContent('no data for this date');
    expect(screen.getByRole('table')).toHaveTextContent('2.57');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('returns to zone selection with the button or Escape', () => {
    const onBack = vi.fn();
    render(<GlobeView {...baseProps} mode="playback" zoneData={zoneData} onBackToSelection={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: /change zone/i }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onBack).toHaveBeenCalledTimes(2);
  });
});
