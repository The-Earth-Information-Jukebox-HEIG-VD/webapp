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
import { prefersReducedMotion } from '../../utils/motion';
import { spotFrames, spotRadius, writeMatrices, type DatasetSpots } from './flowSpots';
import type { TrailLayerInfo, TrailSpots } from './vinylTrail';

/** Same heights and halo as zone mode's spots (useSpotLayer). */
const BASE_ALTITUDE = 0.003;
const HALO_ALTITUDE = 0.002;
const ALTITUDE_STEP = 0.0008;
const HALO_OPACITY = 0.4;
const HALO_FACTOR = 1.18;
/** New spots grow in behind the needle */
const GROW_MS = 600;
/** Most stops in one side: 10 grooves of at most 80 points */
const CAPACITY = 800;

interface Layer {
  discs: InstancedMesh;
  halos: InstancedMesh;
  rings: InstancedMesh | null;
  ringHalos: InstancedMesh | null;
  /** Spots drawn at full size so far (the next ones grow in) */
  shown: number;
}

function instanced(geometry: BufferGeometry, material: MeshBasicMaterial): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, CAPACITY);
  mesh.count = 0;
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * Draws the vinyl data trail (vinylTrail.ts) with the GPU, in the style of
 * zone mode's flowing spots: a disc per spot (a ring for a below-normal
 * anomaly) over a light halo. Spots added since the last update grow in.
 * Does nothing where the globe has no WebGL scene (tests).
 */
export function useTrailSpotLayer(
  globeRef: RefObject<GlobeMethods | undefined>,
  globeReady: boolean,
  layers: TrailLayerInfo[],
  spots: TrailSpots[]
): void {
  const meshesRef = useRef<Layer[]>([]);

  // Meshes per selected dataset
  useEffect(() => {
    const globe = globeRef.current;
    if (!globeReady || !globe || typeof globe.scene !== 'function') return;
    const disc = new CircleGeometry(1, 20);
    const ring = new RingGeometry(0.62, 1, 24);
    const ringHalo = new RingGeometry(0.5, 1.12, 24);
    const halo = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: HALO_OPACITY, depthWrite: false });
    const materials = [halo];
    const group = new Group();
    meshesRef.current = layers.map(({ info }) => {
      const colour = new MeshBasicMaterial({ color: new Color(info.color) });
      materials.push(colour);
      const signed = info.display.mode === 'abs';
      const layer: Layer = {
        discs: instanced(disc, colour),
        halos: instanced(disc, halo),
        rings: signed ? instanced(ring, colour) : null,
        ringHalos: signed ? instanced(ringHalo, halo) : null,
        shown: 0,
      };
      for (const m of [layer.halos, layer.ringHalos, layer.discs, layer.rings]) if (m) group.add(m);
      return layer;
    });
    globe.scene().add(group);
    return () => {
      globe.scene().remove(group);
      for (const l of meshesRef.current) for (const m of [l.discs, l.halos, l.rings, l.ringHalos]) m?.dispose();
      disc.dispose();
      ring.dispose();
      ringHalo.dispose();
      for (const m of materials) m.dispose();
      meshesRef.current = [];
    };
  }, [globeRef, globeReady, layers]);

  // Place the spots; the new ones grow from nothing
  useEffect(() => {
    const globe = globeRef.current;
    const meshes = meshesRef.current;
    if (!globe || !meshes.length || typeof globe.getCoords !== 'function') return;
    const worldPerDegree = (globe.getGlobeRadius() * Math.PI) / 180;

    const prepared = meshes.map((layer, d) => {
      const s = spots[d];
      const n = Math.min(CAPACITY, s?.lat.length ?? 0);
      const asSpots = { lat: s?.lat ?? new Float32Array(), lng: s?.lng ?? new Float32Array() } as DatasetSpots;
      const altitude = BASE_ALTITUDE + d * ALTITUDE_STEP;
      const frames = spotFrames(asSpots, (lat, lng) => globe.getCoords(lat, lng, altitude)).subarray(0, n * 12);
      const haloFrames = spotFrames(asSpots, (lat, lng) => globe.getCoords(lat, lng, HALO_ALTITUDE)).subarray(0, n * 12);
      const disc = new Float32Array(n);
      const ring = new Float32Array(n);
      for (let k = 0; k < n; k++) {
        const r = spotRadius(s.size[k], s.maxRadius, s.scale[k]) * worldPerDegree;
        disc[k] = s.size[k] < 0 ? 0 : r;
        ring[k] = s.size[k] < 0 ? r : 0;
      }
      // Fewer spots than before (new record, track switched off): no growing
      const from = layer.shown <= n ? layer.shown : n;
      return { layer, n, frames, haloFrames, disc, ring, from };
    });

    const draw = (f: number) => {
      const e = f * f * (3 - 2 * f);
      for (const { layer, n, frames, haloFrames, disc, ring, from } of prepared) {
        const grow = (radii: Float32Array) => {
          if (e >= 1) return radii;
          const out = radii.slice();
          for (let k = from; k < n; k++) out[k] *= e;
          return out;
        };
        const d = grow(disc);
        const r = grow(ring);
        const put = (mesh: InstancedMesh | null, fr: Float32Array, radii: Float32Array, factor: number) => {
          if (!mesh) return;
          writeMatrices(mesh.instanceMatrix.array as Float32Array, fr, radii, factor);
          mesh.count = n;
          mesh.instanceMatrix.needsUpdate = true;
        };
        put(layer.discs, frames, d, 1);
        put(layer.halos, haloFrames, d, HALO_FACTOR);
        put(layer.rings, frames, r, 1);
        put(layer.ringHalos, haloFrames, r, 1);
        if (f >= 1) layer.shown = n;
      }
    };

    if (prefersReducedMotion()) {
      draw(1);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const f = Math.min(1, (t - start) / GROW_MS);
      draw(f);
      if (f < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      // Interrupted by the next stop: these spots count as grown, they do not start over
      cancelAnimationFrame(raf);
      for (const p of prepared) p.layer.shown = p.n;
    };
    // globeReady: the meshes only exist once the globe is ready, draw what is already there
  }, [globeRef, globeReady, spots, layers]);
}
