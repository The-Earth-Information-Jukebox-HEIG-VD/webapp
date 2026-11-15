import { describe, it, expect, vi, afterEach } from 'vitest';
import { withViewTransition, prefersReducedMotion } from './motion';

// jsdom has no View Transitions: install / remove a stub on the document
function stubStart(fn: ((cb: () => void) => unknown) | undefined) {
  Object.defineProperty(document, 'startViewTransition', { value: fn, configurable: true, writable: true });
}

afterEach(() => {
  stubStart(undefined);
  document.documentElement.classList.remove('reduced-motion');
});

describe('withViewTransition', () => {
  it('applies the update directly when the API is missing', () => {
    const update = vi.fn();
    withViewTransition(update);
    expect(update).toHaveBeenCalledOnce();
  });

  it('runs the update inside a view transition when available', () => {
    const start = vi.fn((cb: () => void) => cb());
    stubStart(start);
    const update = vi.fn();
    withViewTransition(update);
    expect(start).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
  });

  it('skips the transition when motion is reduced', () => {
    const start = vi.fn();
    stubStart(start);
    document.documentElement.classList.add('reduced-motion');
    expect(prefersReducedMotion()).toBe(true);
    const update = vi.fn();
    withViewTransition(update);
    expect(start).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
  });

  it('cross-fade only: flags <html> during the transition, then clears it', async () => {
    let finish!: () => void;
    const finished = new Promise<void>((r) => (finish = r));
    stubStart((cb) => {
      cb();
      return { finished };
    });
    withViewTransition(() => {}, { crossfadeOnly: true });
    expect(document.documentElement).toHaveClass('vt-crossfade');
    finish();
    await finished;
    await Promise.resolve();
    expect(document.documentElement).not.toHaveClass('vt-crossfade');
  });
});
