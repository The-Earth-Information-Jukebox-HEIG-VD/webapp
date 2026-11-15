import { describe, it, expect } from 'vitest';
import { withMonth, monthOccurrence, snapToMonth } from './sonificationApi';
import { derivePlayback, frameMonthKey, parseMonthFilter } from '../hooks/useSonification';

describe('month travel period helpers', () => {
  it('withMonth puts a month in the same year', () => {
    expect(withMonth('1950-03', 7)).toBe('1950-07');
    expect(withMonth('1950', 12)).toBe('1950-12');
    expect(withMonth('bad', 7)).toBe('bad');
  });

  it('monthOccurrence finds the latest occurrence at or before a position', () => {
    expect(monthOccurrence(1950.5, 7)).toBe('1950-07'); // exactly July 1950
    expect(monthOccurrence(1950.9, 7)).toBe('1950-07');
    expect(monthOccurrence(1951.2, 7)).toBe('1950-07'); // still in the July 1950 bar
    expect(monthOccurrence(1950, 1)).toBe('1950-01');
  });

  it('snapToMonth keeps the date heard while the playhead crosses the year', () => {
    expect(snapToMonth(1951.3, 7)).toBeCloseTo(1950.5, 9);
    expect(snapToMonth(1951.3, null)).toBe(1951.3);
  });

  it('derivePlayback reports the year of the month being heard', () => {
    const r = derivePlayback(1951.3, { start: 1880, end: 2025 }, 2026, 7);
    expect(r.currentYear).toBe(1950);
    expect(r.position).toBe(1951.3); // the playhead keeps moving
    expect(derivePlayback(1951.3, { start: 1880, end: 2025 }, 2026).currentYear).toBe(1951);
  });

  it('frameMonthKey keeps the globe on the chosen month', () => {
    expect(frameMonthKey(1951.3, 7)).toBe('1950_07');
    expect(frameMonthKey(1951.3, null)).toBe('1951_04');
  });

  it('parseMonthFilter accepts 1..12 only', () => {
    expect(parseMonthFilter('7')).toBe(7);
    expect(parseMonthFilter('')).toBeNull();
    expect(parseMonthFilter(null)).toBeNull();
    expect(parseMonthFilter('13')).toBeNull();
    expect(parseMonthFilter('x')).toBeNull();
  });
});
