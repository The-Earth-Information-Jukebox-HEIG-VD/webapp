import { useState, useEffect, useRef, useCallback } from 'react';
import { SonificationEngine, type MultiTrackData } from '../audio/SonificationEngine';
import type { ClimateDataset } from '../types';
import type { TrackState } from '../types/tracks';

/**
 * Custom hook for managing multi-track sonification playback
 *
 * Handles the lifecycle of the SonificationEngine and provides
 * a clean interface for React components to control audio playback.
 */
export function useSonification(dataset: ClimateDataset | null) {
  const engineRef = useRef<SonificationEngine | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentYear, setCurrentYear] = useState(1880);
  const [progress, setProgress] = useState(0);
  const [trackStates, setTrackStates] = useState<TrackState[]>([]);
  const [yearRange, setYearRange] = useState({ start: 1880, end: 2024 });

  // Initialize engine on mount
  useEffect(() => {
    const engine = new SonificationEngine({
      minFrequency: 220,
      maxFrequency: 880,
      noteDuration: 400,
      noteGap: 100,
      waveform: 'sine',
      volume: 0.5,
    });

    engine.onProgress = (index, total, year) => {
      setCurrentIndex(index);
      setProgress(total > 0 ? index / total : 0);
      setCurrentYear(year);
    };

    engine.onStateChange = (playing) => {
      setIsPlaying(playing);
    };

    engine.onComplete = () => {
      setIsPlaying(false);
      setProgress(1);
    };

    engine.onTrackChange = (states) => {
      setTrackStates(states);
    };

    engineRef.current = engine;

    // Get initial track states immediately (works before audio init)
    setTrackStates(engine.getTrackStates());

    // Initialize audio context (async - may need user interaction)
    engine.initialize().catch((err) => {
      console.warn('Audio initialization deferred until user interaction:', err);
    });

    return () => {
      engine.dispose();
    };
  }, []);

  // Load data when dataset changes
  useEffect(() => {
    if (dataset && engineRef.current) {
      engineRef.current.loadData(dataset.points);
      setCurrentIndex(0);
      setProgress(0);

      const range = engineRef.current.getYearRange();
      setYearRange(range);
      setCurrentYear(range.start);
    }
  }, [dataset]);

  const play = useCallback(async () => {
    if (engineRef.current) {
      await engineRef.current.play();
    }
  }, []);

  const pause = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.pause();
    }
  }, []);

  const stop = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.stop();
    }
  }, []);

  const seek = useCallback((position: number) => {
    if (engineRef.current) {
      engineRef.current.seek(position);
    }
  }, []);

  const seekToYear = useCallback((year: number) => {
    if (engineRef.current) {
      engineRef.current.seekToYear(year);
    }
  }, []);

  const setVolume = useCallback((volume: number) => {
    if (engineRef.current) {
      engineRef.current.setConfig({ volume });
    }
  }, []);

  const setTrackEnabled = useCallback((trackId: string, enabled: boolean) => {
    if (engineRef.current) {
      engineRef.current.setTrackEnabled(trackId, enabled);
    }
  }, []);

  const setTrackVolume = useCallback((trackId: string, volume: number) => {
    if (engineRef.current) {
      engineRef.current.setTrackVolume(trackId, volume);
    }
  }, []);

  const loadMultiTrackData = useCallback((data: MultiTrackData[]) => {
    if (engineRef.current) {
      engineRef.current.loadMultiTrackData(data);
      setCurrentIndex(0);
      setProgress(0);

      const range = engineRef.current.getYearRange();
      setYearRange(range);
      setCurrentYear(range.start);
    }
  }, []);

  return {
    // Playback state
    isPlaying,
    currentIndex,
    currentYear,
    progress,
    yearRange,

    // Track state
    trackStates,

    // Playback controls
    play,
    pause,
    stop,
    seek,
    seekToYear,
    setVolume,

    // Track controls
    setTrackEnabled,
    setTrackVolume,
    loadMultiTrackData,
  };
}

export default useSonification;
