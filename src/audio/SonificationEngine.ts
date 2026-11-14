import type { ClimateDataPoint, SonificationConfig } from '../types';
import type { TrackState, DataSourceType } from '../types/tracks';
import { TrackOscillator } from './TrackOscillator';
import { tracks as availableTracks } from '../data/tracks';

/**
 * SonificationEngine - Converts climate data to multi-track audio
 *
 * This engine maps multiple climate metrics to audible frequencies,
 * allowing users to "hear" different data trends simultaneously.
 *
 * Key features:
 * - Multi-track support with different instruments
 * - ADSR envelope shaping for natural sound
 * - Timestamp-based seek for key moment navigation
 * - Per-track volume and enable/disable controls
 */

const DEFAULT_CONFIG: SonificationConfig = {
  minFrequency: 220,
  maxFrequency: 880,
  noteDuration: 400,
  noteGap: 100,
  waveform: 'sine',
  volume: 0.5,
  attackTime: 0.02,
  releaseTime: 0.05,
};

export interface MultiTrackData {
  timestamp: Date;
  year: number;
  values: Partial<Record<DataSourceType, number>>;
}

export class SonificationEngine {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private trackOscillators: Map<string, TrackOscillator> = new Map();
  private config: SonificationConfig;

  // Track state managed independently of oscillators (for pre-initialization)
  private trackStateMap: Map<string, { enabled: boolean; volume: number }> = new Map();

  // Single-track data (legacy support)
  private data: ClimateDataPoint[] = [];
  private dataMin = 0;
  private dataMax = 1;

  // Multi-track data
  private multiTrackData: MultiTrackData[] = [];
  private trackDataRanges: Map<DataSourceType, { min: number; max: number }> = new Map();

  private currentIndex = 0;
  private isPlaying = false;
  private isPaused = false;
  private playbackTimer: number | null = null;

  // Event callbacks
  public onProgress?: (index: number, total: number, year: number) => void;
  public onComplete?: () => void;
  public onStateChange?: (isPlaying: boolean) => void;
  public onTrackChange?: (trackStates: TrackState[]) => void;

  constructor(config: Partial<SonificationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    // Initialize track state map with defaults from track data
    availableTracks.forEach((track) => {
      this.trackStateMap.set(track.id, {
        enabled: track.defaultEnabled,
        volume: track.defaultVolume,
      });
    });
  }

  /**
   * Initialize the Web Audio API context
   */
  public async initialize(): Promise<void> {
    if (this.audioContext) return;

    this.audioContext = new AudioContext();
    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = this.config.volume;
    this.masterGain.connect(this.audioContext.destination);

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    // Initialize track oscillators
    this.initializeTracks();
  }

  /**
   * Initialize track oscillators for all available tracks
   * Syncs oscillators with any state changes made before initialization
   */
  private initializeTracks(): void {
    if (!this.audioContext || !this.masterGain) return;

    availableTracks.forEach((track) => {
      const oscillator = new TrackOscillator(
        this.audioContext!,
        track,
        this.masterGain!
      );

      // Sync oscillator with current state (in case user changed before init)
      const state = this.trackStateMap.get(track.id);
      if (state) {
        oscillator.setEnabled(state.enabled);
        oscillator.setVolume(state.volume);
      }

      this.trackOscillators.set(track.id, oscillator);
    });
  }

  /**
   * Load single-track climate data (legacy support)
   */
  public loadData(data: ClimateDataPoint[]): void {
    this.data = data;
    this.currentIndex = 0;

    const values = data.map((d) => d.anomaly ?? d.value);
    this.dataMin = Math.min(...values);
    this.dataMax = Math.max(...values);

    // Also create multi-track format for compatibility
    this.multiTrackData = data.map((point) => ({
      timestamp: point.timestamp,
      year: point.timestamp.getFullYear(),
      values: {
        temperature: point.anomaly ?? point.value,
      },
    }));

    this.trackDataRanges.set('temperature', { min: this.dataMin, max: this.dataMax });

    // Update track oscillators with data range
    const tempOsc = this.trackOscillators.get('temperature');
    if (tempOsc) {
      tempOsc.setDataRange(this.dataMin, this.dataMax);
    }
  }

  /**
   * Load multi-track climate data
   */
  public loadMultiTrackData(data: MultiTrackData[]): void {
    this.multiTrackData = data;
    this.currentIndex = 0;

    // Calculate ranges for each data source
    const sourceTypes: DataSourceType[] = [
      'co2_atmosphere', 'co2_emissions', 'night_lights', 'temperature',
      'wildfires', 'antarctica_melt', 'lightning', 'ecosystem', 'deforestation'
    ];

    sourceTypes.forEach((source) => {
      const values = data
        .map((d) => d.values[source])
        .filter((v): v is number => v !== undefined);

      if (values.length > 0) {
        const min = Math.min(...values);
        const max = Math.max(...values);
        this.trackDataRanges.set(source, { min, max });

        // Find track using this data source and set range
        const track = availableTracks.find((t) => t.dataSource === source);
        if (track) {
          const osc = this.trackOscillators.get(track.id);
          if (osc) {
            osc.setDataRange(min, max);
          }
        }
      }
    });

    // Also set legacy data format
    this.data = data.map((d) => ({
      timestamp: d.timestamp,
      value: d.values.temperature ?? 0,
      anomaly: d.values.temperature,
    }));

    if (data.length > 0) {
      const tempValues = data.map((d) => d.values.temperature ?? 0);
      this.dataMin = Math.min(...tempValues);
      this.dataMax = Math.max(...tempValues);
    }
  }

  /**
   * Map a data value to frequency (legacy single-track)
   */
  private valueToFrequency(value: number): number {
    const normalized = (value - this.dataMin) / (this.dataMax - this.dataMin || 1);
    return this.config.minFrequency +
      normalized * (this.config.maxFrequency - this.config.minFrequency);
  }

  /**
   * Play a single note (legacy single-track)
   */
  private playNote(frequency: number, startTime: number): void {
    if (!this.audioContext || !this.masterGain) return;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.type = this.config.waveform;
    oscillator.frequency.value = frequency;

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

    const dataLength = this.multiTrackData.length || this.data.length;
    if (dataLength === 0) {
      console.warn('No data loaded for sonification');
      return;
    }

    this.isPlaying = true;
    this.isPaused = false;
    this.onStateChange?.(true);

    this.playNextNote();
  }

  /**
   * Play the next note in sequence (multi-track)
   */
  private playNextNote(): void {
    if (!this.isPlaying || this.isPaused || !this.audioContext) return;

    const dataLength = this.multiTrackData.length || this.data.length;
    if (this.currentIndex >= dataLength) {
      this.stop();
      this.onComplete?.();
      return;
    }

    const now = this.audioContext.currentTime;
    const duration = this.config.noteDuration / 1000;

    // Multi-track playback
    if (this.multiTrackData.length > 0) {
      const point = this.multiTrackData[this.currentIndex];

      // Play each enabled track
      this.trackOscillators.forEach((osc, trackId) => {
        const track = availableTracks.find((t) => t.id === trackId);
        if (track && osc.isEnabled()) {
          const value = point.values[track.dataSource];
          if (value !== undefined) {
            osc.playNote(value, now, duration);
          }
        }
      });

      this.onProgress?.(this.currentIndex, dataLength, point.year);
    } else {
      // Legacy single-track playback
      const dataPoint = this.data[this.currentIndex];
      const value = dataPoint.anomaly ?? dataPoint.value;
      const frequency = this.valueToFrequency(value);

      this.playNote(frequency, now);
      this.onProgress?.(this.currentIndex, dataLength, dataPoint.timestamp.getFullYear());
    }

    this.currentIndex++;

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
   * Stop playback and reset
   */
  public stop(): void {
    this.isPlaying = false;
    this.isPaused = false;
    this.currentIndex = 0;

    if (this.playbackTimer) {
      clearTimeout(this.playbackTimer);
      this.playbackTimer = null;
    }

    // Stop all track oscillators
    this.trackOscillators.forEach((osc) => osc.stop());

    this.onStateChange?.(false);
    const dataLength = this.multiTrackData.length || this.data.length;
    const year = this.multiTrackData[0]?.year ?? this.data[0]?.timestamp.getFullYear() ?? 1880;
    this.onProgress?.(0, dataLength, year);
  }

  /**
   * Seek to a specific position (0-1)
   */
  public seek(position: number): void {
    const dataLength = this.multiTrackData.length || this.data.length;
    const index = Math.floor(position * dataLength);
    this.currentIndex = Math.max(0, Math.min(index, dataLength - 1));

    const year = this.multiTrackData[this.currentIndex]?.year ??
      this.data[this.currentIndex]?.timestamp.getFullYear() ?? 1880;
    this.onProgress?.(this.currentIndex, dataLength, year);
  }

  /**
   * Seek to a specific year
   */
  public seekToYear(year: number): void {
    const index = this.multiTrackData.findIndex((d) => d.year === year);
    if (index >= 0) {
      this.currentIndex = index;
      const dataLength = this.multiTrackData.length || this.data.length;
      this.onProgress?.(this.currentIndex, dataLength, year);
    }
  }

  /**
   * Set track enabled state
   * Works before and after audio initialization
   */
  public setTrackEnabled(trackId: string, enabled: boolean): void {
    // Update state map (works before initialization)
    const state = this.trackStateMap.get(trackId);
    if (state) {
      state.enabled = enabled;
    }

    // Update oscillator if it exists (after initialization)
    const osc = this.trackOscillators.get(trackId);
    if (osc) {
      osc.setEnabled(enabled);
    }

    this.emitTrackChange();
  }

  /**
   * Set track volume
   * Works before and after audio initialization
   */
  public setTrackVolume(trackId: string, volume: number): void {
    // Update state map (works before initialization)
    const state = this.trackStateMap.get(trackId);
    if (state) {
      state.volume = volume;
    }

    // Update oscillator if it exists (after initialization)
    const osc = this.trackOscillators.get(trackId);
    if (osc) {
      osc.setVolume(volume);
    }

    this.emitTrackChange();
  }

  /**
   * Get all track states
   * Works before and after audio initialization
   */
  public getTrackStates(): TrackState[] {
    return Array.from(this.trackStateMap.entries()).map(([id, state]) => ({
      id,
      enabled: state.enabled,
      volume: state.volume,
    }));
  }

  /**
   * Emit track change event
   */
  private emitTrackChange(): void {
    this.onTrackChange?.(this.getTrackStates());
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
    const dataLength = this.multiTrackData.length || this.data.length;
    const year = this.multiTrackData[this.currentIndex]?.year ??
      this.data[this.currentIndex]?.timestamp.getFullYear() ?? 1880;

    return {
      isPlaying: this.isPlaying,
      isPaused: this.isPaused,
      currentIndex: this.currentIndex,
      totalPoints: dataLength,
      progress: dataLength > 0 ? this.currentIndex / dataLength : 0,
      currentYear: year,
    };
  }

  /**
   * Get the year range of loaded data
   */
  public getYearRange(): { start: number; end: number } {
    if (this.multiTrackData.length > 0) {
      return {
        start: this.multiTrackData[0].year,
        end: this.multiTrackData[this.multiTrackData.length - 1].year,
      };
    }
    if (this.data.length > 0) {
      return {
        start: this.data[0].timestamp.getFullYear(),
        end: this.data[this.data.length - 1].timestamp.getFullYear(),
      };
    }
    return { start: 1880, end: 2024 };
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    this.stop();
    this.trackOscillators.forEach((osc) => osc.dispose());
    this.trackOscillators.clear();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

export default SonificationEngine;
