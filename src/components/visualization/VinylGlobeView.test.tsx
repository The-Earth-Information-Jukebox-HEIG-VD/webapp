import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'jest-axe';
import '../../i18n';
import { VinylGlobeView } from './VinylGlobeView';
import { VinylRecordView } from './VinylRecordView';
import { PerspectiveCamera, type Group, type InstancedMesh, type MeshBasicMaterial } from 'three';
import { VINYL_ALTITUDE } from '../../utils/vinylGeometry';
import type { Track } from '../../types/tracks';
import type { VinylChunkMeta } from '../../services/vinylApi';

let globeProps: Record<string, unknown> = {};
const pointOfView = vi.fn();
const controls = { enabled: true };
// A fake projection: x = 200 + lng, y = 200 - lat (north is up)
const getScreenCoords = vi.fn((lat: number, lng: number) => ({ x: 200 + lng, y: 200 - lat }));
// Camera 2.6 radii from the centre, looking at it (as in vinyl mode)
const R = 100;
const camera = new PerspectiveCamera(50, 1, 1, 10000);
camera.position.set(0, 0, 2.6 * R);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld();
const toGeoCoords = vi.fn(({ x, y, z }: { x: number; y: number; z: number }) => ({
  lat: (Math.asin(y / R) * 180) / Math.PI,
  lng: (Math.atan2(x, z) * 180) / Math.PI,
  altitude: 0,
}));

// Scene of the globe: the spot layer adds its meshes here
const sceneGroups: Group[] = [];
const scene = {
  add: (g: Group) => sceneGroups.push(g),
  remove: (g: Group) => sceneGroups.splice(sceneGroups.indexOf(g), 1),
};
const getCoords = (lat: number, lng: number, alt = 0) => {
  const r = R * (1 + alt);
  const phi = (lat * Math.PI) / 180;
  const lambda = (lng * Math.PI) / 180;
  return { x: r * Math.cos(phi) * Math.sin(lambda), y: r * Math.sin(phi), z: r * Math.cos(phi) * Math.cos(lambda) };
};
/** Spots drawn per mesh colour (discs only: no halos, no rings) */
function drawnDiscs(): number[] {
  return sceneGroups.flatMap((g) =>
    g.children
      .filter((m): m is InstancedMesh => (m as InstancedMesh).isInstancedMesh)
      .filter((m) => !(m.material as MeshBasicMaterial).transparent && m.geometry.type === 'CircleGeometry')
      .map((m) => m.count)
  );
}

vi.mock('react-globe.gl', async () => {
  const { forwardRef, useImperativeHandle, useEffect } = await import('react');
  return {
    default: forwardRef((props: Record<string, unknown>, ref) => {
      globeProps = props;
      useImperativeHandle(ref, () => ({
        pointOfView,
        controls: () => controls,
        getScreenCoords,
        camera: () => camera,
        getGlobeRadius: () => R,
        toGeoCoords,
        scene: () => scene,
        getCoords,
      }));
      const onGlobeReady = props.onGlobeReady as () => void;
      useEffect(() => onGlobeReady(), [onGlobeReady]);
      return <div data-testid="globe" />;
    }),
  };
});

const base = {
  center: { lat: 10, lng: 20 },
  onCenterPick: vi.fn(),
  monthLabel: 'March 2020',
  chunkIndex: 0,
  started: false,
  isPlaying: false,
  getLiveProgress: () => 0,
  history: {},
  tracks: [],
  reducedMotion: false,
};

beforeEach(() => {
  pointOfView.mockClear();
  controls.enabled = true;
  document.documentElement.classList.remove('reduced-motion');
});

describe('VinylGlobeView', () => {
  it('looks straight down at the centre with the globe locked', () => {
    render(<VinylGlobeView {...base} />);
    expect(pointOfView).toHaveBeenCalledWith({ lat: 10, lng: 20, altitude: VINYL_ALTITUDE }, expect.any(Number));
    expect(controls.enabled).toBe(false);
    expect(globeProps.enablePointerInteraction).toBe(false);
  });

  it('describes the record and lists every groove in a table', async () => {
    const { container } = render(<VinylGlobeView {...base} />);
    expect(screen.getByRole('img', { name: /centred on 10\.0° N, 20\.0° E, playing March 2020/ })).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(table.querySelectorAll('tbody tr')).toHaveLength(10);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('a click is mapped by a ray cast: the centre of the canvas is the centre of the globe', () => {
    const onCenterPick = vi.fn();
    render(<VinylGlobeView {...base} onCenterPick={onCenterPick} />);
    const stage = document.querySelector('.vinyl-stage') as HTMLElement;
    // jsdom has no layout: the canvas is the 240 px minimum
    stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 240, height: 240, right: 240, bottom: 240, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.click(stage, { clientX: 120, clientY: 120 });
    expect(onCenterPick).toHaveBeenCalledTimes(1);
    const picked = onCenterPick.mock.calls[0][0];
    expect(picked.lat).toBeCloseTo(0, 5);
    expect(picked.lng).toBeCloseTo(0, 5);
    // A corner is off the globe: no new centre
    fireEvent.click(stage, { clientX: 1, clientY: 1 });
    expect(onCenterPick).toHaveBeenCalledTimes(1);
  });

  it('leaves flowing spots on the globe for the stops already passed', () => {
    // Draw at once (no grow-in) so the spots can be counted
    document.documentElement.classList.add('reduced-motion');
    const temperature = { id: 'temperature', color: '#e67e22', nameKey: 'x', label: 'T', units: 'degC anomaly' } as Track;
    const meta: VinylChunkMeta = {
      chunkIndex: 0,
      nextChunkIndex: 1,
      center: base.center,
      timePeriod: '2020-03',
      travel: 'space',
      periods: ['2020-03'],
      barStarts: null,
      stops: [
        { lat: 1, lng: 1, values: { temperature: 1.5 } },
        { lat: 2, lng: 2, values: { temperature: null } },
        { lat: 3, lng: 3, values: { temperature: -1.5 } },
      ],
      stopSeconds: 10,
      radiusDeg: 2,
      values: { temperature: 0 },
    };
    render(<VinylGlobeView {...base} started chunkIndex={1} history={{ 0: meta }} tracks={[temperature]} />);
    // No more dots in the points layer: only the centre spindle
    expect((globeProps.pointsData as { id: string }[]).map((d) => d.id)).toEqual(['center']);
    // Groove 0 is behind the needle: 2 spots (null has none); the cold one is a ring, not a disc
    expect(drawnDiscs()).toEqual([2]);
    const ringMesh = sceneGroups[0].children.find(
      (m) => (m as InstancedMesh).geometry.type === 'RingGeometry' && !((m as InstancedMesh).material as MeshBasicMaterial).transparent
    ) as InstancedMesh;
    expect(ringMesh.count).toBe(2);
  });

  it('does not animate with reduced motion, and marks the groove being played', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    render(<VinylGlobeView {...base} started isPlaying chunkIndex={3} reducedMotion />);
    expect(raf).not.toHaveBeenCalled();
    const markers = globeProps.pointsData as { id: string }[];
    expect(markers.map((m) => m.id)).toContain('needle');
    expect(document.querySelector('.vinyl-caption')).toHaveTextContent('Groove 4 of 10');
    raf.mockRestore();
  });

  it('spins while playing', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    render(<VinylGlobeView {...base} started isPlaying />);
    expect(raf).toHaveBeenCalled();
    raf.mockRestore();
  });

  it('reveals the current groove stop by stop', () => {
    document.documentElement.classList.add('reduced-motion');
    const rain = { id: 'precipitation', color: '#3498db', nameKey: 'x', label: 'Rain', units: 'mm/h' } as Track;
    const meta: VinylChunkMeta = {
      chunkIndex: 0,
      nextChunkIndex: 1,
      center: base.center,
      timePeriod: '2020-03',
      travel: 'space',
      periods: ['2020-03'],
      barStarts: null,
      stops: [0, 1, 2].map((i) => ({ lat: i, lng: i, values: { precipitation: 0.4 } })),
      stopSeconds: 10,
      radiusDeg: 2,
      values: { precipitation: 0.4 },
    };
    // 15 s into groove 0: stops 0 and 1 reached
    render(
      <VinylGlobeView {...base} started chunkIndex={0} getLiveProgress={() => 0.05} history={{ 0: meta }} tracks={[rain]} />
    );
    expect(drawnDiscs()).toEqual([2]);
  });
});

describe('VinylGlobeView in time travel', () => {
  const temperature = { id: 'temperature', color: '#e67e22', nameKey: 'x', label: 'T', units: 'degC anomaly' } as Track;
  const meta: VinylChunkMeta = {
    chunkIndex: 0,
    nextChunkIndex: 1,
    center: base.center,
    timePeriod: '2020-03',
    travel: 'time',
    periods: ['2020-03', '2020-04', '2020-05'],
    barStarts: [0, 10, 20],
    stops: [{ lat: 10, lng: 20, values: { temperature: 1.5 } }],
    stopSeconds: 30,
    radiusDeg: 2,
    values: { temperature: 1.5 },
  };

  it('hides the moving trail and shows one centre spot coloured by the value', () => {
    document.documentElement.classList.add('reduced-motion');
    render(
      <VinylGlobeView {...base} travel="time" started chunkIndex={0} history={{ 0: meta }} tracks={[temperature]} reducedMotion />
    );
    // No trail spots drawn
    expect(drawnDiscs().every((n) => n === 0)).toBe(true);
    const markers = globeProps.pointsData as { id: string; lat: number; lng: number; color: string }[];
    expect(markers.map((m) => m.id)).toEqual(['center', 'time-spot']);
    expect(markers[1]).toMatchObject({ lat: 10, lng: 20 });
    expect(markers[1].color).toMatch(/^rgba\(\d+, \d+, \d+, 0\.\d+\)$/);
    // The needle does not move over the ground: no reduced-motion needle marker
    expect(markers.map((m) => m.id)).not.toContain('needle');
  });

  it('shows the real month in the caption and a date column in the table', () => {
    render(
      <VinylGlobeView {...base} travel="time" started chunkIndex={0} getLiveProgress={() => 0.05} history={{ 0: meta }} tracks={[temperature]} />
    );
    // 15 s into the groove: the second month
    expect(document.querySelector('.vinyl-caption-month')).toHaveTextContent('April 2020');
    expect(screen.getByRole('columnheader', { name: 'Date' })).toBeInTheDocument();
    expect(screen.getByText('March 2020 to May 2020')).toBeInTheDocument();
  });
});

describe('VinylRecordView', () => {
  it('is a labelled record with a visible groove table', async () => {
    const { container } = render(
      <VinylRecordView center={{ lat: 50, lng: 10 }} monthLabel="March 2020" chunkIndex={2} started history={{}} tracks={[]} />
    );
    expect(screen.getByRole('img', { name: /playing March 2020/ })).toBeInTheDocument();
    expect(screen.getByRole('row', { current: true })).toHaveTextContent('Groove 3 of 10');
    expect(await axe(container)).toHaveNoViolations();
  });
});
