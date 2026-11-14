/**
 * Instrument types available for Web Audio synthesis
 * These are fetched from the backend via /api/instruments
 */
export type InstrumentType = 'piano' | 'percussion' | 'strings' | 'synth';

/**
 * Instrument configuration for Web Audio API oscillators
 *
 * Each instrument has distinct characteristics:
 * - Piano: Clean sine wave with sharp attack/release
 * - Percussion: Triangle wave with punchy envelope
 * - Strings: Sawtooth wave with slow attack for pad-like sound
 * - Synth: Square wave with medium envelope for electronic character
 */
export interface InstrumentConfig {
  waveform: OscillatorType;
  attackTime: number;      // seconds
  decayTime: number;       // seconds
  sustainLevel: number;    // 0-1
  releaseTime: number;     // seconds
  harmonics?: number[];    // Additional harmonic frequencies (multipliers)
  filterFrequency?: number; // Low-pass filter cutoff
  filterQ?: number;        // Filter resonance
}

/**
 * Default frequency range when backend info not available
 */
export const DEFAULT_FREQUENCY_RANGE = { min: 220, max: 880 };

export const instruments: Record<InstrumentType, InstrumentConfig> = {
  piano: {
    waveform: 'sine',
    attackTime: 0.01,
    decayTime: 0.1,
    sustainLevel: 0.6,
    releaseTime: 0.3,
    harmonics: [2, 3], // Add 2nd and 3rd harmonics for richness
    filterFrequency: 4000,
    filterQ: 1,
  },

  percussion: {
    waveform: 'triangle',
    attackTime: 0.005,
    decayTime: 0.15,
    sustainLevel: 0.2,
    releaseTime: 0.1,
    filterFrequency: 2000,
    filterQ: 2,
  },

  strings: {
    waveform: 'sawtooth',
    attackTime: 0.2,
    decayTime: 0.3,
    sustainLevel: 0.7,
    releaseTime: 0.5,
    filterFrequency: 3000,
    filterQ: 0.5,
  },

  synth: {
    waveform: 'square',
    attackTime: 0.05,
    decayTime: 0.2,
    sustainLevel: 0.5,
    releaseTime: 0.2,
    filterFrequency: 2500,
    filterQ: 3,
  },
};

/**
 * Get instrument configuration by type
 */
export function getInstrumentConfig(type: InstrumentType): InstrumentConfig {
  return instruments[type];
}

export default instruments;
