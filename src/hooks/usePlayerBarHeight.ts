import { useEffect, type RefObject } from 'react';

/**
 * Keeps --player-bar-height on :root equal to the real height of the fixed player bar,
 * so the page padding, scroll-padding and sticky panels follow when the bar grows
 * (data graph on, wrapped controls, text zoom). The default lives in styles/variables.css.
 */
export function usePlayerBarHeight(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    // jsdom and very old browsers have no ResizeObserver: keep the CSS default
    if (!el || typeof ResizeObserver === 'undefined') return;
    const root = document.documentElement;
    const update = () => {
      const height = Math.ceil(el.getBoundingClientRect().height);
      if (height > 0) root.style.setProperty('--player-bar-height', `${height}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--player-bar-height');
    };
  }, [ref]);
}

export default usePlayerBarHeight;
