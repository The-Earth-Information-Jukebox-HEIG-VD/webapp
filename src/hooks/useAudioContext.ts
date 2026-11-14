import { useState, useEffect, useCallback } from 'react';

/**
 * Hook for managing AudioContext lifecycle
 *
 * Browsers require user interaction before creating AudioContext.
 * This hook tracks whether audio is ready and provides initialization.
 */
export function useAudioContext() {
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialize = useCallback(async () => {
    try {
      if (audioContext) {
        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }
        setIsReady(true);
        return audioContext;
      }

      const ctx = new AudioContext();

      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      setAudioContext(ctx);
      setIsReady(true);
      setError(null);
      return ctx;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initialize audio';
      setError(message);
      setIsReady(false);
      return null;
    }
  }, [audioContext]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (audioContext) {
        audioContext.close();
      }
    };
  }, [audioContext]);

  return {
    audioContext,
    isReady,
    error,
    initialize,
  };
}

export default useAudioContext;
