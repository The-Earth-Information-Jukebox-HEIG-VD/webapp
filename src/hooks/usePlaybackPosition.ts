import { useSyncExternalStore } from 'react';

/**
 * External store for the playback position (fractional year, or null before
 * playback). ChunkPlayer reports it ~every 100 ms: keeping it outside React
 * state lets only the components that need the fine value re-render.
 */
export interface PositionStore {
  get: () => number | null;
  set: (position: number | null) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createPositionStore(initial: number | null = null): PositionStore {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next) => {
      if (Object.is(next, value)) return;
      value = next;
      // Copy: a listener may unsubscribe while being notified
      [...listeners].forEach((l) => l());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Raw position (fine: re-renders on every change) */
export function usePlaybackPosition(store: PositionStore): number | null;
/** Derived primitive: re-renders only when the selected value changes */
export function usePlaybackPosition<T extends string | number | boolean | null>(
  store: PositionStore,
  selector: (position: number | null) => T
): T;
export function usePlaybackPosition(
  store: PositionStore,
  selector?: (position: number | null) => string | number | boolean | null
) {
  return useSyncExternalStore(store.subscribe, () =>
    selector ? selector(store.get()) : store.get()
  );
}
