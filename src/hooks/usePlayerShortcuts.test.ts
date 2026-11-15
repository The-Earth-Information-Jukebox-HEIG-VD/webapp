import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePlayerShortcuts } from './usePlayerShortcuts';

function setup() {
  const handlers = {
    onPlayPause: vi.fn(),
    onPrev: vi.fn(),
    onNext: vi.fn(),
    onFirst: vi.fn(),
    onLast: vi.fn(),
    onMute: vi.fn(),
  };
  renderHook(() => usePlayerShortcuts(handlers));
  return handlers;
}

function press(target: Element, key: string) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

describe('usePlayerShortcuts', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('seeks to first/last with Home/End', () => {
    const h = setup();
    press(document.body, 'Home');
    press(document.body, 'End');
    expect(h.onFirst).toHaveBeenCalledTimes(1);
    expect(h.onLast).toHaveBeenCalledTimes(1);
  });

  it('leaves Home/End to a focused scroll region, but keeps play/pause and mute', () => {
    const h = setup();
    const list = document.createElement('ul');
    list.setAttribute('data-scroll-region', '');
    document.body.appendChild(list);

    press(list, 'Home');
    press(list, 'End');
    press(list, ' ');
    press(list, 'm');

    expect(h.onFirst).not.toHaveBeenCalled();
    expect(h.onLast).not.toHaveBeenCalled();
    expect(h.onPlayPause).toHaveBeenCalledTimes(1);
    expect(h.onMute).toHaveBeenCalledTimes(1);
  });
});
