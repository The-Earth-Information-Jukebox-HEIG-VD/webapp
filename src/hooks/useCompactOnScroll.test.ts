import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCompactOnScroll, COMPACT_ENTER_Y, COMPACT_EXIT_Y } from './useCompactOnScroll';

function scrollTo(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
  window.dispatchEvent(new Event('scroll'));
}

// Run the requestAnimationFrame-throttled update
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

describe('useCompactOnScroll', () => {
  afterEach(() => scrollTo(0));

  it('becomes compact past the threshold and expands only near the top (no flicker)', async () => {
    const { result } = renderHook(() => useCompactOnScroll());
    expect(result.current).toBe(false);

    await act(async () => { scrollTo(COMPACT_ENTER_Y + 1); await nextFrame(); });
    expect(result.current).toBe(true);

    // Inside the hysteresis band: stays compact
    await act(async () => { scrollTo(COMPACT_EXIT_Y + 10); await nextFrame(); });
    expect(result.current).toBe(true);

    await act(async () => { scrollTo(0); await nextFrame(); });
    expect(result.current).toBe(false);
  });
});
