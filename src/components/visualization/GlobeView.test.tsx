import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'jest-axe';
import '../../i18n';
import { GlobeView, flightDuration } from './GlobeView';
import { KNOWN_DATASETS } from '../../data/datasetRegistry';
import { findZoneFeature } from '../../data/zones';
import { getFeatureView } from '../../utils/geometry';
import type { ZoneDataFrames } from '../../hooks/useZoneDataFrames';
import type { VolumeDataset } from '../../services/volumeData';
import type { Track } from '../../types/tracks';

// WebGL is not available in jsdom: capture the props given to the globe instead
let globeProps: Record<string, unknown> = {};
// Camera calls made through the globe ref
const pointOfView = vi.fn();
vi.mock('react-globe.gl', async () => {
  const { forwardRef, useImperativeHandle, useEffect } = await import('react');
  return {
    default: forwardRef((props: Record<string, unknown>, ref) => {
      globeProps = props;
      useImperativeHandle(ref, () => ({ pointOfView }));
      const onGlobeReady = props.onGlobeReady as () => void;
      useEffect(() => onGlobeReady(), [onGlobeReady]);
      return <div data-testid="globe" />;
    }),
  };
});

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

  it('shows zone polygons in select mode', () => {
    render(<GlobeView {...baseProps} mode="select" />);
    expect((globeProps.polygonsData as object[]).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /change zone/i })).not.toBeInTheDocument();
  });

  it('removes the zone polygons in playback and draws no 3D points (spots are on their own skin)', () => {
    render(<GlobeView {...baseProps} mode="playback" zoneData={zoneData} onBackToSelection={vi.fn()} />);
    expect(globeProps.polygonsData).toEqual([]);
    expect(globeProps.pointsData).toBeUndefined();
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

describe('GlobeView camera', () => {
  beforeEach(() => {
    pointOfView.mockClear();
  });

  it('shows the whole Earth while no zone is selected', () => {
    render(<GlobeView {...baseProps} selectedZone={null} />);
    expect(pointOfView).toHaveBeenLastCalledWith({ lat: 20, lng: 0, altitude: 2.5 }, expect.any(Number));
  });

  it('frames the selected zone', () => {
    const { rerender } = render(<GlobeView {...baseProps} selectedZone={null} />);
    rerender(<GlobeView {...baseProps} selectedZone="france" />);
    const expected = getFeatureView(findZoneFeature('france')!);
    expect(pointOfView).toHaveBeenLastCalledWith(expected, expect.any(Number));
    expect(expected.altitude).toBeLessThan(1);
  });

  it('keeps the camera where it is when playback starts or stops', () => {
    const { rerender } = render(<GlobeView {...baseProps} selectedZone="france" mode="select" />);
    pointOfView.mockClear();
    rerender(<GlobeView {...baseProps} selectedZone="france" mode="playback" zoneData={zoneData} onBackToSelection={vi.fn()} />);
    rerender(<GlobeView {...baseProps} selectedZone="france" mode="select" />);
    expect(pointOfView).not.toHaveBeenCalled();
  });
});

describe('GlobeView legend instruments', () => {
  const track = (id: string, instrument: string): Track => ({
    id, nameKey: `tracks.${id}`, label: id, instrument, role: 'harmony', available: true,
    alwaysPlaying: true, units: null, period: null, color: '#ffffff', defaultEnabled: true,
  });
  const tracks = [track('temperature', 'Piano (chords)'), track('co2', 'Cello')];

  it('names the instrument of each enabled track and marks the sounding ones', async () => {
    const { container } = render(
      <GlobeView
        {...baseProps}
        mode="playback"
        zoneData={zoneData}
        onBackToSelection={vi.fn()}
        tracks={tracks}
        enabledTrackIds={new Set(['temperature', 'co2'])}
        soundingIds={new Set(['temperature'])}
      />
    );
    const legend = screen.getByRole('region', { name: 'Datasets' });
    expect(legend).toHaveTextContent('♪ Piano (chords)');
    expect(legend).toHaveTextContent('played by Piano (chords) (Sounding now)');
    expect(legend).toHaveTextContent('♪ Cello');
    expect(legend).not.toHaveTextContent('played by Cello (Sounding now)');
    expect(screen.getAllByTestId('legend-sounding')).toHaveLength(1);
    expect(screen.getByRole('table')).toHaveTextContent('Piano (chords)');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('hides the instrument of a track switched off', () => {
    render(
      <GlobeView
        {...baseProps}
        mode="playback"
        zoneData={zoneData}
        onBackToSelection={vi.fn()}
        tracks={tracks}
        enabledTrackIds={new Set(['co2'])}
      />
    );
    const legend = screen.getByRole('region', { name: 'Datasets' });
    expect(legend).not.toHaveTextContent('Piano');
    expect(legend).toHaveTextContent('♪ Cello');
  });
});

describe('flightDuration', () => {
  it('is short for a nearby hop and longer across the planet, within bounds', () => {
    const near = flightDuration({ lat: 46, lng: 2, altitude: 0.4 }, { lat: 47, lng: 8, altitude: 0.3 });
    const far = flightDuration({ lat: 46, lng: 2, altitude: 0.4 }, { lat: -17, lng: 178, altitude: 0.25 });
    expect(near).toBeGreaterThanOrEqual(700);
    expect(near).toBeLessThan(far);
    expect(far).toBeLessThanOrEqual(2200);
  });

  it('uses a default when the current position is unknown', () => {
    expect(flightDuration(undefined, { lat: 0, lng: 0, altitude: 1 })).toBe(1200);
  });
});
