import { useEffect, useState } from 'react';

/** Scroll depth (px) past which the header becomes compact. */
export const COMPACT_ENTER_Y = 64;
/** Scroll depth (px) under which it expands again. */
export const COMPACT_EXIT_Y = 8;

/**
 * True once the page is scrolled past COMPACT_ENTER_Y, false again near the top.
 *
 * The gap between the two thresholds (hysteresis) is larger than the height the
 * header loses: shrinking a sticky header shifts the page, which changes scrollY,
 * and a single threshold would make the header flicker between both states.
 */
export function useCompactOnScroll(): boolean {
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.scrollY > COMPACT_ENTER_Y);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      setCompact((was) => (was ? y > COMPACT_EXIT_Y : y > COMPACT_ENTER_Y));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return compact;
}
