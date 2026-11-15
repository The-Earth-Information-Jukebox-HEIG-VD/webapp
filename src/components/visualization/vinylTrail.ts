/**
 * Vinyl data trail: what the needle has read stays on the globe, drawn like
 * zone mode's flowing spots (flowSpots.ts). One spot per selected dataset at
 * each stop already passed; its AREA grows with the value, below the
 * threshold there is no spot, and below-normal anomalies are a ring. Spots of
 * consecutive stops merge into a ribbon along the groove.
 *
 * Pure (no WebGL): drawn by useTrailSpotLayer, unit tested here.
 */
import type { Track } from '../../types/tracks';
import type { VinylChunkMeta } from '../../services/vinylApi';
import { KNOWN_DATASETS, valueToAlpha, type DatasetInfo } from '../../data/datasetRegistry';
import { hash01 } from './flowSpots';

/** Largest spot radius, as a share of the needle's reading radius (radius_deg). */
const RADIUS_SHARE = 0.85;
/** Several datasets at one stop are spread around it (share of radius_deg). */
const SPREAD_SHARE = 0.45;

export interface TrailLayerInfo {
  /** dataset_id of the track (key of the stop values) */
  trackId: string;
  /** Registry entry: colour, display range, ring for signed anomalies */
  info: DatasetInfo;
}

export interface TrailSpots {
  lat: Float32Array;
  lng: Float32Array;
  /** Signed size -1..1 (negative: below-normal anomaly, drawn as a ring) */
  size: Float32Array;
  /** Personal size factor (0.7 - 1.3), stable per stop */
  scale: Float32Array;
  /** Largest radius in degrees */
  maxRadius: number;
}

/** The registry entry playing each enabled track (tracks without one are not drawn). */
export function trailLayers(tracks: Track[]): TrailLayerInfo[] {
  return tracks.flatMap((tr) => {
    const info = KNOWN_DATASETS.find((d) => d.trackIds.includes(tr.id));
    return info ? [{ trackId: tr.id, info }] : [];
  });
}

/** Signed spot size of a value, as in flowSpots.spotSizes. null / NaN -> 0 (no spot). */
export function trailSize(value: number | null | undefined, info: DatasetInfo): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return 0;
  const t = valueToAlpha(value, info.display);
  return info.display.mode === 'abs' && value < 0 ? -t : t;
}

/**
 * Spots of every layer for the grooves heard so far: all stops of the other
 * grooves, the first `reached` stops of the groove under the needle.
 */
export function trailSpots(
  history: Record<number, VinylChunkMeta>,
  chunkIndex: number,
  reached: number,
  layers: TrailLayerInfo[]
): TrailSpots[] {
  const n = layers.length;
  const metas = Object.values(history).sort((a, b) => a.chunkIndex - b.chunkIndex);
  return layers.map((layer, j) => {
    const lat: number[] = [];
    const lng: number[] = [];
    const size: number[] = [];
    const scale: number[] = [];
    let maxRadius = 0;
    const angle = (2 * Math.PI * j) / Math.max(1, n);
    for (const meta of metas) {
      const count = meta.chunkIndex === chunkIndex ? Math.min(reached, meta.stops.length) : meta.stops.length;
      const spread = n > 1 ? meta.radiusDeg * SPREAD_SHARE : 0;
      maxRadius = Math.max(maxRadius, meta.radiusDeg * RADIUS_SHARE);
      for (let i = 0; i < count; i++) {
        const s = meta.stops[i];
        const v = trailSize(s.values[layer.trackId], layer.info);
        if (v === 0) continue;
        const cosLat = Math.max(0.2, Math.cos((s.lat * Math.PI) / 180));
        lat.push(s.lat + spread * Math.cos(angle));
        lng.push(s.lng + (spread * Math.sin(angle)) / cosLat);
        size.push(v);
        scale.push(0.7 + 0.6 * hash01(meta.chunkIndex * 1000 + i * 7 + j));
      }
    }
    return {
      lat: Float32Array.from(lat),
      lng: Float32Array.from(lng),
      size: Float32Array.from(size),
      scale: Float32Array.from(scale),
      maxRadius,
    };
  });
}

export interface TimeSpot {
  /** CSS colour: the dataset's colour, stronger for a bigger value */
  color: string;
  /** Radius for the globe's point layer, in degrees */
  radius: number;
  trackId: string;
}

/**
 * Time travel: the needle stays on one place, so the trail gives way to a
 * single spot at the centre, coloured by the first selected dataset that has a
 * value (the more of it, the stronger the colour and the bigger the spot).
 */
export function timeSpot(values: Record<string, number | null> | undefined, layers: TrailLayerInfo[]): TimeSpot | null {
  if (!values) return null;
  for (const layer of layers) {
    const size = trailSize(values[layer.trackId], layer.info);
    if (size === 0) continue;
    const strength = Math.abs(size);
    return {
      color: withAlpha(layer.info.color, 0.45 + 0.55 * strength),
      radius: 0.8 + 1.6 * strength,
      trackId: layer.trackId,
    };
  }
  return null;
}

function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha.toFixed(2)})`;
}
