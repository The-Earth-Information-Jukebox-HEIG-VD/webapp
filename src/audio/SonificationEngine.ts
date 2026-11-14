import type { ClimateDataPoint, SonificationConfig } from '../types';

/**
 * SonificationEngine - Converts climate data to audio using Web Audio API
 *
 * This engine maps numerical climate data (like temperature anomalies) to
 * audible frequencies, allowing users to "hear" data trends.
 *
 * Key concepts:
 * - Higher values = higher pitch
 * - Time progression = sequential notes
 * - Smooth envelopes prevent clicking artifacts
 */

const DEFAULT_CONFIG: SonificationConfig = {
  minFrequency: 220,      // A3 - comfortable low
  maxFrequency: 880,      // A5 - comfortable high
  noteDuration: 300,      // ms per data point
  noteGap: 50,            // ms between notes
  waveform: 'sine',       // Clean, pure tone
  volume: 0.3,            // Moderate volume
  attackTime: 0.02,       // 20ms attack (prevents clicks)
  releaseTime: 0.05,      // 50ms release (smooth fade)
};

export class SonificationEngine {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private data: ClimateDataPoint[] = [];
  private config: SonificationConfig;
  private currentIndex = 0;
  private isPlaying = false;
  private isPaused = false;
  private playbackTimer: number | null = null;
  private dataMin = 0;
  private dataMax = 1;

  // Event callbacks
  public onProgress?: (index: number, total: number) => void;
  public onComplete?: () => void;
  public onStateChange?: (isPlaying: boolean) => void;

  constructor(config: Partial<SonificationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the Web Audio API context
   * Must be called after user interaction (browser autoplay policy)
   */
  public async initialize(): Promise<void> {
    if (this.audioContext) return;

    this.audioContext = new AudioContext();
    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = this.config.volume;
    this.masterGain.connect(this.audioContext.destination);

    // Resume context if suspended (Safari)
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  /**
   * Load climate data for sonification
   */
  public loadData(data: ClimateDataPoint[]): void {
    this.data = data;
    this.currentIndex = 0;

    // Calculate min/max for frequency mapping
    const values = data.map((d) => d.anomaly ?? d.value);
    this.dataMin = Math.min(...values);
    this.dataMax = Math.max(...values);
  }

  /**
   * Map a data value to a frequency
   */
  private valueToFrequency(value: number): number {
    // Normalize value to 0-1 range
    const normalized = (value - this.dataMin) / (this.dataMax - this.dataMin || 1);
    // Map to frequency range
    return this.config.minFrequency +
      normalized * (this.config.maxFrequency - this.config.minFrequency);
  }

  /**
   * Play a single note at the given frequency
   */
  private playNote(frequency: number, startTime: number): void {
    if (!this.audioContext || !this.masterGain) return;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.type = this.config.waveform;
    oscillator.frequency.value = frequency;

    // Envelope to prevent clicks
    const duration = this.config.noteDuration / 1000;
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(1, startTime + this.config.attackTime);
    gainNode.gain.setValueAtTime(1, startTime + duration - this.config.releaseTime);
    gainNode.gain.linearRampToValueAtTime(0, startTime + duration);

    oscillator.connect(gainNode);
    gainNode.connect(this.masterGain);

    oscillator.start(startTime);
    oscillator.stop(startTime + duration);
  }

  /**
   * Start or resume playback
   */
  public async play(): Promise<void> {
    await this.initialize();

    if (this.data.length === 0) {
      console.warn('No data loaded for sonification');
      return;
    }

    this.isPlaying = true;
    this.isPaused = false;
    this.onStateChange?.(true);

    this.playNextNote();
  }

  /**
   * Play the next note in sequence
   */
  private playNextNote(): void {
    if (!this.isPlaying || this.isPaused || !this.audioContext) return;

    if (this.currentIndex >= this.data.length) {
      this.stop();
      this.onComplete?.();
      return;
    }

    const dataPoint = this.data[this.currentIndex];
    const value = dataPoint.anomaly ?? dataPoint.value;
    const frequency = this.valueToFrequency(value);

    this.playNote(frequency, this.audioContext.currentTime);
    this.onProgress?.(this.currentIndex, this.data.length);

    this.currentIndex++;

    // Schedule next note
    const interval = this.config.noteDuration + this.config.noteGap;
    this.playbackTimer = window.setTimeout(() => this.playNextNote(), interval);
  }

  /**
   * Pause playback
   */
  public pause(): void {
    this.isPaused = true;
    this.isPlaying = false;
    if (this.playbackTimer) {
      clearTimeout(this.playbackTimer);
      this.playbackTimer = null;
    }
    this.onStateChange?.(false);
  }

  /**
   * Stop playback and reset to beginning
   */
  public stop(): void {
    this.isPlaying = false;
    this.isPaused = false;
    this.currentIndex = 0;
    if (this.playbackTimer) {
      clearTimeout(this.playbackTimer);
      this.playbackTimer = null;
    }
    this.onStateChange?.(false);
    this.onProgress?.(0, this.data.length);
  }

  /**
   * Seek to a specific position (0-1)
   */
  public seek(position: number): void {
    const index = Math.floor(position * this.data.length);
    this.currentIndex = Math.max(0, Math.min(index, this.data.length - 1));
    this.onProgress?.(this.currentIndex, this.data.length);
  }

  /**
   * Update configuration
   */
  public setConfig(config: Partial<SonificationConfig>): void {
    this.config = { ...this.config, ...config };
    if (this.masterGain) {
      this.masterGain.gain.value = this.config.volume;
    }
  }

  /**
   * Get current playback state
   */
  public getState() {
    return {
      isPlaying: this.isPlaying,
      isPaused: this.isPaused,
      currentIndex: this.currentIndex,
      totalPoints: this.data.length,
      progress: this.data.length > 0 ? this.currentIndex / this.data.length : 0,
    };
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    this.stop();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

export default SonificationEngine;
