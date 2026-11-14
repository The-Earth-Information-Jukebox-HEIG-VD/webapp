import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { decodeNpyData, halfToFloat, parseNpyHeader } from './npy';

// Fixtures cut from the real files of the datasets volume:
// - header + row 174 of temperature_anomaly_1880_2025/temperature_anomaly_2024_07.npy
// - header (+ 4 values) of co2_2002_2022/co2_2002_09.npy
const fixture = (name: string) =>
  new Uint8Array(readFileSync(resolve(process.cwd(), 'src/test/fixtures', name)));

describe('npy header', () => {
  it('parses a float16 map of the volume', () => {
    const h = parseNpyHeader(fixture('temperature_anomaly_2024_07_row174.npy'));
    expect(h).toEqual({ dtype: 'f2', itemSize: 2, shape: [720, 1440], fortranOrder: false, dataOffset: 128 });
  });

  it('parses a float32 map of the volume (CO2)', () => {
    const h = parseNpyHeader(fixture('co2_header.bin'));
    expect(h.dtype).toBe('f4');
    expect(h.itemSize).toBe(4);
    expect(h.shape).toEqual([720, 1440]);
    expect(h.dataOffset).toBe(128);
  });

  it('rejects non-npy data', () => {
    expect(() => parseNpyHeader(new Uint8Array(128))).toThrow(/magic/);
  });
});

describe('float16 decoding is exact', () => {
  it.each([
    [0x0000, 0],
    [0x3c00, 1],
    [0xc000, -2],
    [0x7bff, 65504],
    [0x0001, 2 ** -24], // smallest subnormal
    [0x4124, 2.5703125],
  ])('0x%s -> %s', (bits, value) => {
    expect(halfToFloat(bits)).toBe(value);
  });

  it('keeps NaN, infinities and negative zero', () => {
    expect(halfToFloat(0x7e00)).toBeNaN();
    expect(halfToFloat(0x7c00)).toBe(Infinity);
    expect(halfToFloat(0xfc00)).toBe(-Infinity);
    expect(Object.is(halfToFloat(0x8000), -0)).toBe(true);
  });

  it('reads the stored value at Lausanne, July 2024 (README: about +2.6 °C)', () => {
    const bytes = fixture('temperature_anomaly_2024_07_row174.npy');
    const { dataOffset, dtype } = parseNpyHeader(bytes);
    const row = decodeNpyData(bytes.subarray(dataOffset), dtype);
    expect(row).toHaveLength(1440);
    expect(row[746]).toBe(2.5703125); // raw bits 0x4124, unchanged
  });

  it('decodes little-endian float32 as stored', () => {
    const buf = new DataView(new ArrayBuffer(8));
    buf.setFloat32(0, 370.6398010253906, true);
    buf.setFloat32(4, NaN, true);
    const out = decodeNpyData(new Uint8Array(buf.buffer), 'f4');
    expect(out[0]).toBe(Math.fround(370.6398010253906));
    expect(out[1]).toBeNaN();
  });
});
