import type { Track } from '../types/tracks';
import {
  getInstrumentConfig,
  type InstrumentConfig,
  type InstrumentType,
  DEFAULT_FREQUENCY_RANGE,
} from './instruments';

/**
 * Options for creating a TrackOscillator
 * Instrument info comes from backend /api/instruments endpoint
 */
export interface TrackOscillatorOptions {
  instrument?: InstrumentType;
  frequencyRange?: { min: number; max: number };
}

/**
 * TrackOscillator - Manages audio for a single track
 *
 * Each track has its own oscillator(s), gain nodes, and filter
 * configured according to its instrument type. Supports ADSR
 * envelope shaping for natural sound.
 *
 * Note: Instrument type and frequency range are now passed in
 * from backend data, not hardcoded in Track interface.
 */
export class TrackOscillator {
  private audioContext: AudioContext;
  private track: Track;
  private instrumentConfig: InstrumentConfig;
  private frequencyRange: { min: number; max: number };
  private masterGain: GainNode;
  private outputGain: GainNode;
  private oscillators: OscillatorNode[] = [];
  private gains: GainNode[] = [];
  private filter: BiquadFilterNode | null = null;

  private volume = 1;
  private enabled = true;
  private dataMin = 0;
  private dataMax = 1;

  constructor(
    audioContext: AudioContext,
    track: Track,
    destination: AudioNode,
    options: TrackOscillatorOptions = {}
  ) {
    this.audioContext = audioContext;
    this.track = track;
    // Use provided instrument type or default to piano
    const instrumentType = options.instrument ?? 'piano';
    this.instrumentConfig = getInstrumentConfig(instrumentType);
    // Use provided frequency range or default
    this.frequencyRange = options.frequencyRange ?? DEFAULT_FREQUENCY_RANGE;
    this.volume = track.defaultVolume;
    this.enabled = track.defaultEnabled;

    // Create master gain for this track
    this.masterGain = audioContext.createGain();
    this.masterGain.gain.value = this.enabled ? this.volume : 0;

    // Create output gain for envelope control
    this.outputGain = audioContext.createGain();
    this.outputGain.gain.value = 0;

    // Create filter if configured
    if (this.instrumentConfig.filterFrequency) {
      this.filter = audioContext.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = this.instrumentConfig.filterFrequency;
      this.filter.Q.value = this.instrumentConfig.filterQ || 1;

      this.outputGain.connect(this.filter);
      this.filter.connect(this.masterGain);
    } else {
      this.outputGain.connect(this.masterGain);
    }

    this.masterGain.connect(destination);
  }

  /**
   * Set the data range for frequency mapping
   */
  public setDataRange(min: number, max: number): void {
    this.dataMin = min;
    this.dataMax = max;
  }

  /**
   * Map a data value to frequency within this track's range
   */
  private valueToFrequency(value: number): number {
    const normalized = (value - this.dataMin) / (this.dataMax - this.dataMin || 1);
    const { min, max } = this.frequencyRange;
    return min + normalized * (max - min);
  }

  /**
   * Play a note with ADSR envelope
   */
  public playNote(value: number, startTime: number, duration: number): void {
    if (!this.enabled) return;

    const frequency = this.valueToFrequency(value);
    const config = this.instrumentConfig;

    // Main oscillator
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.type = config.waveform;
    osc.frequency.value = frequency;

    // ADSR envelope
    const attackEnd = startTime + config.attackTime;
    const decayEnd = attackEnd + config.decayTime;
    const releaseStart = startTime + duration - config.releaseTime;

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(1, attackEnd);
    gain.gain.linearRampToValueAtTime(config.sustainLevel, decayEnd);
    gain.gain.setValueAtTime(config.sustainLevel, releaseStart);
    gain.gain.linearRampToValueAtTime(0, startTime + duration);

    osc.connect(gain);
    gain.connect(this.outputGain);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.1); // Small buffer for release

    this.oscillators.push(osc);
    this.gains.push(gain);

    // Add harmonics if configured
    if (config.harmonics) {
      config.harmonics.forEach((multiplier, index) => {
        const harmOsc = this.audioContext.createOscillator();
        const harmGain = this.audioContext.createGain();

        harmOsc.type = config.waveform;
        harmOsc.frequency.value = frequency * multiplier;

        // Harmonics are quieter than fundamental
        const harmVolume = 0.3 / (index + 2);
        harmGain.gain.setValueAtTime(0, startTime);
        harmGain.gain.linearRampToValueAtTime(harmVolume, attackEnd);
        harmGain.gain.linearRampToValueAtTime(harmVolume * config.sustainLevel, decayEnd);
        harmGain.gain.setValueAtTime(harmVolume * config.sustainLevel, releaseStart);
        harmGain.gain.linearRampToValueAtTime(0, startTime + duration);

        harmOsc.connect(harmGain);
        harmGain.connect(this.outputGain);

        harmOsc.start(startTime);
        harmOsc.stop(startTime + duration + 0.1);

        this.oscillators.push(harmOsc);
        this.gains.push(harmGain);
      });
    }

    // Clean up old oscillators after they finish
    setTimeout(() => {
      this.cleanupOldNodes();
    }, (duration + 0.2) * 1000);
  }

  /**
   * Clean up finished oscillators
   */
  private cleanupOldNodes(): void {
    // Keep only recent oscillators (last 10)
    while (this.oscillators.length > 10) {
      const osc = this.oscillators.shift();
      const gain = this.gains.shift();
      try {
        osc?.disconnect();
        gain?.disconnect();
      } catch {
        // Already disconnected
      }
    }
  }

  /**
   * Set track volume
   */
  public setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.enabled) {
      this.masterGain.gain.setTargetAtTime(
        this.volume,
        this.audioContext.currentTime,
        0.05
      );
    }
  }

  /**
   * Get current volume
   */
  public getVolume(): number {
    return this.volume;
  }

  /**
   * Enable or disable this track
   */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.masterGain.gain.setTargetAtTime(
      enabled ? this.volume : 0,
      this.audioContext.currentTime,
      0.1
    );
  }

  /**
   * Check if track is enabled
   */
  public isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get track ID
   */
  public getTrackId(): string {
    return this.track.id;
  }

  /**
   * Stop all sound and clean up
   */
  public stop(): void {
    const now = this.audioContext.currentTime;
    this.masterGain.gain.setTargetAtTime(0, now, 0.05);

    // Stop all oscillators
    this.oscillators.forEach((osc) => {
      try {
        osc.stop(now + 0.1);
      } catch {
        // Already stopped
      }
    });

    setTimeout(() => {
      this.oscillators.forEach((osc) => {
        try { osc.disconnect(); } catch { /* */ }
      });
      this.gains.forEach((gain) => {
        try { gain.disconnect(); } catch { /* */ }
      });
      this.oscillators = [];
      this.gains = [];
    }, 200);
  }

  /**
   * Dispose of all resources
   */
  public dispose(): void {
    this.stop();
    try {
      this.masterGain.disconnect();
      this.outputGain.disconnect();
      this.filter?.disconnect();
    } catch {
      // Already disconnected
    }
  }
}

export default TrackOscillator;
