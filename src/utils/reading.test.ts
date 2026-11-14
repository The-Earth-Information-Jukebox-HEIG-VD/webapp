import { describe, it, expect, beforeEach } from 'vitest';
import i18n from '../i18n';
import { formatReading } from './reading';

const t = i18n.t.bind(i18n) as Parameters<typeof formatReading>[3];

describe('formatReading', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('shows anomalies with a sign and "vs normal"', () => {
    expect(formatReading(1.24, 'degC', true, t)).toBe('+1.2 °C vs normal');
    expect(formatReading(-0.8, 'degC', true, t)).toBe('−0.8 °C vs normal');
  });

  it('never shows +0.0 or -0.0', () => {
    expect(formatReading(0.04, 'degC', true, t)).toBe('0.0 °C vs normal');
    expect(formatReading(-0.04, 'degC', true, t)).toBe('0.0 °C vs normal');
  });

  it('uses the decimal separator of the language', async () => {
    await i18n.changeLanguage('fr');
    expect(formatReading(1.2, 'degC', true, t)).toMatch(/^\+1,2 °C /);
    await i18n.changeLanguage('de');
    expect(formatReading(12.34, 'mm', false, t)).toBe('12,3 mm');
  });

  it('speaks the unit in words for announcements', async () => {
    expect(formatReading(1.2, 'degC', true, t, { speakable: true })).toBe('+1.2 degrees Celsius vs normal');
    await i18n.changeLanguage('fr');
    expect(formatReading(1.2, 'degC', true, t, { speakable: true })).toContain('degrés Celsius');
  });

  it('shows (0-1) fractions as a percentage', () => {
    expect(formatReading(0.456, 'presence (0-1)', false, t)).toBe('46 %');
  });
});
