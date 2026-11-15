import { describe, it, expect, beforeEach } from 'vitest';
import i18n from '../i18n';
import { formatReading, formatUnits, isAnomalyUnits, speakableUnits } from './reading';

const t = i18n.t.bind(i18n) as Parameters<typeof formatReading>[3];

describe('formatReading', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('shows anomalies with a sign and "vs normal"', () => {
    expect(formatReading(1.24, 'degC anomaly', true, t)).toBe('+1.2 °C vs normal');
    expect(formatReading(-0.8, 'degC anomaly', true, t)).toBe('−0.8 °C vs normal');
  });

  it('never shows +0.0 or -0.0', () => {
    expect(formatReading(0.04, 'degC anomaly', true, t)).toBe('0.0 °C vs normal');
    expect(formatReading(-0.04, 'degC anomaly', true, t)).toBe('0.0 °C vs normal');
  });

  it('uses the decimal separator of the language', async () => {
    await i18n.changeLanguage('fr');
    expect(formatReading(1.2, 'degC anomaly', true, t)).toMatch(/^\+1,2 °C /);
    await i18n.changeLanguage('de');
    expect(formatReading(12.34, 'mm', false, t)).toBe('12,3 mm');
  });

  it('speaks the unit in words for announcements', async () => {
    expect(formatReading(1.2, 'degC anomaly', true, t, { speakable: true })).toBe('+1.2 degrees Celsius vs normal');
    await i18n.changeLanguage('fr');
    expect(formatReading(1.2, 'degC anomaly', true, t, { speakable: true })).toContain('degrés Celsius');
  });

  it('shows (0-1) fractions as a percentage, with a hyphen or an en dash', () => {
    expect(formatReading(0.456, 'brightness (0-1)', false, t)).toBe('46 %');
    expect(formatReading(0.03, 'share of area with lightning (0\u20131)', false, t)).toBe('3 %');
  });

  it('keeps ppm and mm/day, and speaks mm/day in words', () => {
    expect(formatReading(399.49, 'ppm', false, t)).toBe('399 ppm');
    expect(formatReading(2.45, 'mm/day', false, t)).toBe('2.5 mm/day');
    expect(formatReading(2.45, 'mm/day', false, t, { speakable: true })).toBe('2.5 millimetres per day');
  });

  it('shows and speaks the chlorophyll and carbon monoxide units', async () => {
    expect(formatUnits('mg/m3')).toBe('mg/m³');
    expect(formatUnits('1e18 molecules/cm2')).toBe('×10¹⁸ molec/cm²');
    expect(speakableUnits('mg/m3', t)).toBe('milligrams per cubic metre');
    expect(speakableUnits('×10¹⁸ molec/cm²', t)).toMatch(/molecules per square centimetre/);
    await i18n.changeLanguage('fr');
    expect(speakableUnits('mg/m³', t)).toBe('milligrammes par mètre cube');
    await i18n.changeLanguage('de');
    expect(speakableUnits('mg/m3', t)).toBe('Milligramm pro Kubikmeter');
  });

  it('shows the vegetation index as NDVI, with two decimals below 1', async () => {
    await i18n.changeLanguage('en');
    expect(formatUnits('vegetation index (NDVI)')).toBe('NDVI');
    expect(formatReading(0.624, 'vegetation index (NDVI)', false, t)).toBe('0.62 NDVI');
    expect(formatReading(0.624, 'vegetation index (NDVI)', false, t, { speakable: true })).toBe('0.62 vegetation index');
    // Clear sea chlorophyll would otherwise read "0.0 mg/m³"
    expect(formatReading(0.043, 'mg/m3', false, t)).toBe('0.04 mg/m³');
    expect(formatReading(2.71, 'mg/m3', false, t)).toBe('2.7 mg/m³');
    await i18n.changeLanguage('fr');
    expect(speakableUnits('vegetation index (NDVI)', t)).toBe('indice de végétation');
    await i18n.changeLanguage('en');
  });

  it('detects anomaly units', () => {
    expect(isAnomalyUnits('degC anomaly')).toBe(true);
    expect(isAnomalyUnits('ppm')).toBe(false);
  });
});
