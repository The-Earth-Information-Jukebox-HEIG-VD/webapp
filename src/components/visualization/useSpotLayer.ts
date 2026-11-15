import { useEffect, useRef, type RefObject } from 'react';
import {
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  SRGBColorSpace,
} from 'three';
import type { GlobeMethods } from 'react-globe.gl';
import type { ZoneGrid } from '../../utils/zoneCells';
import type { ZoneFrame } from '../../hooks/useZoneDataFrames';
import type { VolumeDataset } from '../../services/volumeData';
import { prefersReducedMotion } from '../../utils/motion';
import {
  blendSizes,
  layoutSpots,
  paintSpots,
  spotBounds,
  spotSizes,
  type DatasetSpots,
  type SpotBounds,
  type SpotLayer,
} from './flowSpots';

/** Height of the spot skin above the globe surface (globe radii). */
const SKIN_ALTITUDE = 0.004;
/** Time for spots to grow or shrink to the new month. */
const TWEEN_MS = 900;
/** One mesh vertex every this many degrees, so the skin follows the sphere. */
const MESH_STEP_DEG = 2;

interface Skin {
  bounds: SpotBounds;
  ctx: CanvasRenderingContext2D;
  scratch: CanvasRenderingContext2D;
  texture: CanvasTexture;
  mesh: Mesh;
  layouts: Map<string, DatasetSpots>;
  /** Sizes currently on screen, per dataset id. */
  shown: Map<string, Float32Array>;
}

function context2d(width: number, height: number): CanvasRenderingContext2D | null {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas.getContext('2d');
}

/** A curved patch over the bounding box, with UVs mapping it to the canvas. */
function skinGeometry(globe: GlobeMethods, b: SpotBounds): BufferGeometry {
  const spanLat = b.latMax - b.latMin;
  const spanLng = b.lngMax - b.lngMin;
  const nx = Math.max(4, Math.ceil(spanLng / MESH_STEP_DEG));
  const ny = Math.max(4, Math.ceil(spanLat / MESH_STEP_DEG));
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  for (let j = 0; j <= ny; j++) {
    const lat = b.latMax - (j / ny) * spanLat;
    for (let i = 0; i <= nx; i++) {
      const p = globe.getCoords(lat, b.lngMin + (i / nx) * spanLng, SKIN_ALTITUDE);
      positions.push(p.x, p.y, p.z);
      uvs.push(i / nx, 1 - j / ny); // canvas row 0 = top = latMax
    }
  }
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      const c = a + nx + 1;
      index.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  return geometry;
}

/**
 * Draws the zone's data as flowing spots on a transparent skin over the globe
 * (see flowSpots.ts). Spots grow and shrink smoothly when the month changes.
 * Does nothing where WebGL or canvas are missing (tests, old browsers).
 */
export function useSpotLayer(
  globeRef: RefObject<GlobeMethods | undefined>,
  globeReady: boolean,
  grid: ZoneGrid | null,
  datasets: VolumeDataset[],
  frame: ZoneFrame | null
): void {
  const skinRef = useRef<Skin | null>(null);

  // One skin per zone grid
  useEffect(() => {
    const globe = globeRef.current;
    if (!globeReady || !grid || !grid.cells.length || !globe) return;
    if (typeof globe.scene !== 'function' || typeof globe.getCoords !== 'function') return;
    const bounds = spotBounds(grid);
    const ctx = context2d(bounds.width, bounds.height);
    const scratch = context2d(bounds.width, bounds.height);
    if (!ctx || !scratch) return;

    const texture = new CanvasTexture(ctx.canvas);
    texture.colorSpace = SRGBColorSpace;
    const material = new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: DoubleSide });
    const mesh = new Mesh(skinGeometry(globe, bounds), material);
    mesh.renderOrder = 1;
    globe.scene().add(mesh);
    skinRef.current = { bounds, ctx, scratch, texture, mesh, layouts: new Map(), shown: new Map() };

    return () => {
      globe.scene().remove(mesh);
      mesh.geometry.dispose();
      material.dispose();
      texture.dispose();
      skinRef.current = null;
    };
  }, [globeRef, globeReady, grid]);

  // Grow / shrink the spots towards the values of the new month
  useEffect(() => {
    const skin = skinRef.current;
    if (!skin || !grid) return;
    const n = grid.cells.length;
    const plan = datasets.map((ds) => {
      const id = ds.info.id;
      let spots = skin.layouts.get(id);
      if (!spots) {
        spots = layoutSpots(grid, id);
        skin.layouts.set(id, spots);
      }
      const from = skin.shown.get(id) ?? new Float32Array(n);
      const to = spotSizes(frame?.get(id), n, ds.info);
      const now = new Float32Array(from); // on screen until the first tween frame
      skin.shown.set(id, now);
      return { info: ds.info, spots, from, to, now };
    });
    // Datasets switched off disappear
    for (const id of [...skin.shown.keys()]) {
      if (!datasets.some((ds) => ds.info.id === id)) skin.shown.delete(id);
    }

    const draw = (f: number) => {
      const layers: SpotLayer[] = plan.map((p) => ({
        info: p.info,
        spots: p.spots,
        sizes: blendSizes(p.from, p.to, f, p.now),
      }));
      paintSpots(skin.ctx, skin.scratch, skin.bounds, layers);
      skin.texture.needsUpdate = true;
    };

    if (prefersReducedMotion()) {
      draw(1);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const step = (t: number) => {
      const f = Math.min(1, (t - start) / TWEEN_MS);
      draw(f);
      if (f < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    // A newer month interrupts the tween: it continues from the sizes on screen
    return () => cancelAnimationFrame(raf);
  }, [grid, datasets, frame, globeReady]);
}
