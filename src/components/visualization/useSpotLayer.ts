import { useEffect, useRef, type RefObject } from 'react';
import {
  CircleGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  MeshBasicMaterial,
  RingGeometry,
  type BufferGeometry,
} from 'three';
import type { GlobeMethods } from 'react-globe.gl';
import type { ZoneGrid } from '../../utils/zoneCells';
import type { ZoneFrame } from '../../hooks/useZoneDataFrames';
import type { VolumeDataset } from '../../services/volumeData';
import { prefersReducedMotion } from '../../utils/motion';
import {
  blendSizes,
  layoutSpots,
  spotFrames,
  spotScales,
  spotSizes,
  writeMatrices,
  type DatasetSpots,
} from './flowSpots';

/** Height of the first dataset's spots above the globe (globe radii). */
const BASE_ALTITUDE = 0.003;
/**
 * Halos sit under every spot: three.js draws transparent meshes after opaque
 * ones, so a halo at the spots' height would tint them. Lower, the depth test
 * keeps it to the rim around the patches.
 */
const HALO_ALTITUDE = 0.002;
/** Extra height per dataset, so overlapping spots never flicker. */
const ALTITUDE_STEP = 0.0008;
/** Time for spots to grow or shrink to the new month. */
const TWEEN_MS = 900;
/** Light rim around each patch, so dark colours (rain) show on the dark Earth image. */
const HALO_OPACITY = 0.4;
const HALO_FACTOR = 1.18;

interface Layer {
  id: string;
  spots: DatasetSpots;
  frames: Float32Array;
  haloFrames: Float32Array;
  disc: Float32Array;
  ring: Float32Array;
  discs: InstancedMesh;
  halos: InstancedMesh;
  /** Below-normal anomalies (temperature) only. */
  rings: InstancedMesh | null;
  ringHalos: InstancedMesh | null;
  from: Float32Array;
  to: Float32Array;
  now: Float32Array;
}

function instanced(geometry: BufferGeometry, material: MeshBasicMaterial, count: number): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, Math.max(1, count));
  mesh.count = count;
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  // Instances spread over the zone: the geometry's bounds say nothing about them
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * Draws the zone's data as flowing spots on the globe (see flowSpots.ts).
 * Spots grow and shrink smoothly when the month changes. Does nothing where
 * the globe has no WebGL scene (tests).
 */
export function useSpotLayer(
  globeRef: RefObject<GlobeMethods | undefined>,
  globeReady: boolean,
  grid: ZoneGrid | null,
  datasets: VolumeDataset[],
  frame: ZoneFrame | null
): void {
  const layersRef = useRef<Layer[]>([]);
  const drawRef = useRef<((layer: Layer) => void) | null>(null);
  // Sizes on screen per dataset id, kept across track toggles of the same zone
  const shownRef = useRef<{ grid: ZoneGrid | null; sizes: Map<string, Float32Array> }>({ grid: null, sizes: new Map() });

  // Meshes for the zone and its datasets
  useEffect(() => {
    const globe = globeRef.current;
    if (!globeReady || !grid || !grid.cells.length || !globe) return;
    if (typeof globe.scene !== 'function' || typeof globe.getCoords !== 'function') return;
    if (shownRef.current.grid !== grid) shownRef.current = { grid, sizes: new Map() };

    const worldPerDegree = (globe.getGlobeRadius() * Math.PI) / 180;
    const disc = new CircleGeometry(1, 20);
    const ring = new RingGeometry(0.62, 1, 24);
    const ringHalo = new RingGeometry(0.5, 1.12, 24);
    const halo = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: HALO_OPACITY, depthWrite: false });
    const materials: MeshBasicMaterial[] = [halo];
    const group = new Group();

    layersRef.current = datasets.map((ds, d) => {
      const spots = layoutSpots(grid, ds.info.id);
      const n = spots.cells.length;
      const altitude = BASE_ALTITUDE + d * ALTITUDE_STEP;
      const frames = spotFrames(spots, (lat, lng) => globe.getCoords(lat, lng, altitude));
      const haloFrames = spotFrames(spots, (lat, lng) => globe.getCoords(lat, lng, HALO_ALTITUDE));
      const colour = new MeshBasicMaterial({ color: new Color(ds.info.color) });
      materials.push(colour);
      const layer: Layer = {
        id: ds.info.id,
        spots,
        frames,
        haloFrames,
        disc: new Float32Array(n),
        ring: new Float32Array(n),
        discs: instanced(disc, colour, n),
        halos: instanced(disc, halo, n),
        rings: ds.info.display.mode === 'abs' ? instanced(ring, colour, n) : null,
        ringHalos: ds.info.display.mode === 'abs' ? instanced(ringHalo, halo, n) : null,
        from: new Float32Array(grid.cells.length),
        to: new Float32Array(grid.cells.length),
        now: new Float32Array(grid.cells.length),
      };
      for (const m of [layer.halos, layer.ringHalos, layer.discs, layer.rings]) if (m) group.add(m);
      return layer;
    });

    const draw = (layer: Layer) => {
      spotScales(layer.now, layer.spots, worldPerDegree, layer.disc, layer.ring);
      const update = (mesh: InstancedMesh | null, frames: Float32Array, radii: Float32Array, factor: number) => {
        if (!mesh) return;
        writeMatrices(mesh.instanceMatrix.array as Float32Array, frames, radii, factor);
        mesh.instanceMatrix.needsUpdate = true;
      };
      update(layer.discs, layer.frames, layer.disc, 1);
      update(layer.halos, layer.haloFrames, layer.disc, HALO_FACTOR);
      update(layer.rings, layer.frames, layer.ring, 1);
      update(layer.ringHalos, layer.haloFrames, layer.ring, 1);
    };
    // Show what was on screen before the rebuild (track toggled), else nothing yet
    for (const layer of layersRef.current) {
      const kept = shownRef.current.sizes.get(layer.id);
      if (kept) layer.now.set(kept);
      shownRef.current.sizes.set(layer.id, layer.now);
      draw(layer);
    }
    drawRef.current = draw;
    globe.scene().add(group);

    return () => {
      globe.scene().remove(group);
      for (const layer of layersRef.current) {
        for (const m of [layer.discs, layer.halos, layer.rings, layer.ringHalos]) m?.dispose();
      }
      disc.dispose();
      ring.dispose();
      ringHalo.dispose();
      for (const m of materials) m.dispose();
      layersRef.current = [];
      drawRef.current = null;
    };
  }, [globeRef, globeReady, grid, datasets]);

  // Grow / shrink the spots towards the values of the new month
  useEffect(() => {
    const layers = layersRef.current;
    const draw = drawRef.current;
    if (!grid || !layers.length || !draw) return;
    const n = grid.cells.length;
    datasets.forEach((ds, d) => {
      const layer = layers[d];
      if (!layer || layer.id !== ds.info.id) return;
      layer.from.set(layer.now); // continue from what is on screen
      layer.to = spotSizes(frame?.get(ds.info.id), n, ds.info);
    });

    const step = (f: number) => {
      for (const layer of layers) {
        blendSizes(layer.from, layer.to, f, layer.now);
        draw(layer);
      }
    };
    if (prefersReducedMotion()) {
      step(1);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const f = Math.min(1, (t - start) / TWEEN_MS);
      step(f);
      if (f < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // A newer month interrupts the tween: it continues from the sizes on screen
    return () => cancelAnimationFrame(raf);
  }, [grid, datasets, frame, globeReady]);
}
