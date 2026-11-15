import { flushSync } from 'react-dom';

/**
 * True when motion should be avoided: the OS setting, or the app's own
 * reduced-motion preference (AccessibilityContext puts `.reduced-motion` on <html>).
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    document.documentElement.classList.contains('reduced-motion') ||
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { finished?: Promise<unknown> } | undefined;
};

export interface ViewTransitionOptions {
  /**
   * true: a short, still cross-fade of the whole page; named regions do not
   * travel or resize (for changes where the morph itself is distracting).
   */
  crossfadeOnly?: boolean;
}

/** Class on <html> while a cross-fade-only transition runs (see animations.css). */
const CROSSFADE_CLASS = 'vt-crossfade';

/**
 * Apply a React state change that rearranges the layout (panel collapsed,
 * globe/list swap) as a View Transition: the browser morphs every element with
 * a `view-transition-name` from its old box to its new one instead of jumping.
 *
 * Falls back to a plain update without the API (Firefox < 144, jsdom) or when
 * motion is reduced. flushSync makes React commit inside the transition callback,
 * so the "new" snapshot is the updated DOM.
 */
export function withViewTransition(update: () => void, options: ViewTransitionOptions = {}): void {
  const doc = document as ViewTransitionDocument;
  if (!doc.startViewTransition || prefersReducedMotion()) {
    update();
    return;
  }
  const root = document.documentElement;
  if (options.crossfadeOnly) root.classList.add(CROSSFADE_CLASS);
  const transition = doc.startViewTransition(() => flushSync(update));
  if (options.crossfadeOnly) {
    const done = () => root.classList.remove(CROSSFADE_CLASS);
    if (transition?.finished) transition.finished.then(done, done);
    else done();
  }
}
