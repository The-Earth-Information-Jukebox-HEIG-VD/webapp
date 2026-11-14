import { useState, useEffect, useRef, useCallback } from 'react';
import { SonificationEngine } from '../audio/SonificationEngine';
import type { ClimateDataset } from '../types';

/**
 * Custom hook for managing sonification playback
 *
 * Handles the lifecycle of the SonificationEngine and provides
 * a clean interface for React components to control audio playback.
 */
export function useSonification(dataset: ClimateDataset | null) {
  const engineRef = useRef<SonificationEngine | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  // Initialize engine on mount
  useEffect(() => {
    const engine = new SonificationEngine({
      minFrequency: 220,
      maxFrequency: 880,
      noteDuration: 400,
      noteGap: 100,
      waveform: 'sine',
      volume: 0.3,
    });

    engine.onProgress = (index, total) => {
      setCurrentIndex(index);
      setProgress(total > 0 ? index / total : 0);
    };

    engine.onStateChange = (playing) => {
      setIsPlaying(playing);
    };

    engine.onComplete = () => {
      setIsPlaying(false);
      setProgress(1);
    };

    engineRef.current = engine;

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

  const setVolume = useCallback((volume: number) => {
    if (engineRef.current) {
      engineRef.current.setConfig({ volume });
    }
  }, []);

  return {
    isPlaying,
    currentIndex,
    progress,
    play,
    pause,
    stop,
    seek,
    setVolume,
  };
}

export default useSonification;
