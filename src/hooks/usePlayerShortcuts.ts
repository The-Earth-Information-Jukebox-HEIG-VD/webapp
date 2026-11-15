import { useEffect, useRef } from 'react';

export interface PlayerShortcutHandlers {
  onPlayPause: () => void;
  onPrev: () => void;
  onNext: () => void;
  onFirst: () => void;
  onLast: () => void;
  onMute: () => void;
}

/**
 * Global player keys: Space (play/pause), arrows (previous/next), Home/End
 * (first/last), M (mute). Same guards as the zone player bar: form fields,
 * sliders, popover dialogs, focused buttons (Space) and open modals keep their
 * own keys, and Cmd/Ctrl/Alt combinations are left to the browser.
 */
export function usePlayerShortcuts(handlers: PlayerShortcutHandlers) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="slider"]')) return;
      if (target?.closest('[role="dialog"]')) return;
      if (e.key === ' ' && target?.closest('button, a, [role="button"]')) return;
      if (document.querySelector('[aria-modal="true"]')) return;

      const h = ref.current;
      const actions: Record<string, () => void> = {
        ' ': h.onPlayPause,
        ArrowLeft: h.onPrev,
        ArrowRight: h.onNext,
        Home: h.onFirst,
        End: h.onLast,
        m: h.onMute,
        M: h.onMute,
      };
      const action = actions[e.key];
      if (!action) return;
      e.preventDefault();
      action();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

export default usePlayerShortcuts;
