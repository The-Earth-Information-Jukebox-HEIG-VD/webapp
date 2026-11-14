/**
 * Minimal reader for NumPy `.npy` files (format v1/v2/v3), enough for the
 * datasets in the jukebox-data volume: little-endian float16 / float32, C order.
 *
 * Values are never transformed: float16 -> float32 is an exact widening
 * (every half-precision value, including NaN, ±0 and subnormals, is
 * representable in single precision).
 */

export type NpyDtype = 'f2' | 'f4';

export interface NpyHeader {
  dtype: NpyDtype;
  itemSize: number;
  shape: number[];
  fortranOrder: boolean;
  /** Byte offset where the array data starts. */
  dataOffset: number;
}

const MAGIC = [0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59]; // \x93NUMPY

/**
 * Parse the header of a `.npy` file.
 * @param bytes - at least the first `dataOffset` bytes of the file (128 is enough for v1)
 */
export function parseNpyHeader(bytes: Uint8Array): NpyHeader {
  for (let i = 0; i < MAGIC.length; i++) {
    if (bytes[i] !== MAGIC[i]) throw new Error('Not a .npy file (bad magic)');
  }
  const major = bytes[6];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let headerLen: number;
  let start: number;
  if (major === 1) {
    headerLen = view.getUint16(8, true);
    start = 10;
  } else if (major === 2 || major === 3) {
    headerLen = view.getUint32(8, true);
    start = 12;
  } else {
    throw new Error(`Unsupported .npy version ${major}`);
  }
  const dataOffset = start + headerLen;
  if (bytes.byteLength < dataOffset) {
    throw new Error('Incomplete .npy header');
  }
  const text = new TextDecoder('latin1').decode(bytes.subarray(start, dataOffset));

  const descr = /'descr'\s*:\s*'([^']+)'/.exec(text)?.[1];
  const fortran = /'fortran_order'\s*:\s*(True|False)/.exec(text)?.[1];
  const shapeText = /'shape'\s*:\s*\(([^)]*)\)/.exec(text)?.[1];
  if (!descr || !fortran || shapeText === undefined) {
    throw new Error(`Malformed .npy header: ${text}`);
  }

  let dtype: NpyDtype;
  if (descr === '<f2' || descr === '|f2') dtype = 'f2';
  else if (descr === '<f4' || descr === '|f4') dtype = 'f4';
  else throw new Error(`Unsupported .npy dtype ${descr}`);

  const shape = shapeText
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number);

  return {
    dtype,
    itemSize: dtype === 'f2' ? 2 : 4,
    shape,
    fortranOrder: fortran === 'True',
    dataOffset,
  };
}

/** Exact IEEE 754 half -> float conversion. */
export function halfToFloat(h: number): number {
  const sign = h & 0x8000 ? -1 : 1;
  const exp = (h >> 10) & 0x1f;
  const frac = h & 0x3ff;
  if (exp === 0) return sign * frac * 2 ** -24; // zero / subnormal
  if (exp === 0x1f) return frac ? NaN : sign * Infinity;
  return sign * (1 + frac / 1024) * 2 ** (exp - 15);
}

/**
 * Decode raw little-endian array bytes (no header) into a Float32Array.
 */
export function decodeNpyData(bytes: Uint8Array, dtype: NpyDtype): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dtype === 'f4') {
    const n = Math.floor(bytes.byteLength / 4);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = view.getFloat32(i * 4, true);
    return out;
  }
  const n = Math.floor(bytes.byteLength / 2);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = halfToFloat(view.getUint16(i * 2, true));
  return out;
}
