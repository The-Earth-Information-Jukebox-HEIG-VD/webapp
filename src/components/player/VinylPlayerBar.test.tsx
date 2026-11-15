import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { axe } from 'jest-axe';
import '../../i18n';
import { VinylPlayerBar } from './VinylPlayerBar';
import { createPositionStore } from '../../hooks/usePlaybackPosition';

function setup(overrides: Partial<Parameters<typeof VinylPlayerBar>[0]> = {}) {
  const props = {
    isPlaying: false,
    status: 'idle' as const,
    error: null,
    hasEnded: false,
    canPlay: true,
    chunkIndex: 2,
    // 72 s into the side: 24 synthetic months after 2000-01
    positionStore: createPositionStore(2002),
    totalSeconds: 300,
    trackStates: [{ id: 'temperature', enabled: true }],
    onPlay: vi.fn(),
    onPause: vi.fn(),
    onRetry: vi.fn(),
    onSeekToChunk: vi.fn(),
    onVolumeChange: vi.fn(),
    onShowTracks: vi.fn(),
    ...overrides,
  };
  const utils = render(<VinylPlayerBar {...props} />);
  return { ...utils, props };
}

describe('VinylPlayerBar', () => {
  it('has no accessibility violations', async () => {
    const { container } = setup();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('describes the groove slider', () => {
    setup();
    const slider = screen.getByRole('slider', { name: 'Groove 3 of 10' });
    expect(slider).toHaveAttribute('aria-valuetext', 'Groove 3 of 10, 1:12 of 5:00');
  });

  it('keys: Space plays, arrows and Home/End move between grooves', () => {
    const { props } = setup();
    fireEvent.keyDown(window, { key: ' ' });
    expect(props.onPlay).toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(props.onSeekToChunk).toHaveBeenLastCalledWith(3);
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(props.onSeekToChunk).toHaveBeenLastCalledWith(1);
    fireEvent.keyDown(window, { key: 'Home' });
    expect(props.onSeekToChunk).toHaveBeenLastCalledWith(0);
    fireEvent.keyDown(window, { key: 'End' });
    expect(props.onSeekToChunk).toHaveBeenLastCalledWith(9);
  });

  it('leaves keys alone inside form fields', () => {
    const { props } = setup();
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    expect(props.onSeekToChunk).not.toHaveBeenCalled();
    input.remove();
  });

  it('the slider seeks after the user settles', () => {
    vi.useFakeTimers();
    const { props } = setup();
    fireEvent.change(screen.getByRole('slider', { name: /Groove/ }), { target: { value: '7' } });
    expect(props.onSeekToChunk).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(props.onSeekToChunk).toHaveBeenCalledWith(6);
    vi.useRealTimers();
  });

  it('explains why Play is blocked without sounds, but Pause always works', () => {
    const { props, rerender } = setup({ canPlay: false });
    expect(screen.getByRole('button', { name: 'Play the record' })).toHaveAttribute('aria-disabled', 'true');
    rerender(<VinylPlayerBar {...props} canPlay={false} isPlaying />);
    fireEvent.click(screen.getByRole('button', { name: 'Pause the record' }));
    expect(props.onPause).toHaveBeenCalled();
  });

  it('shows the real date in time travel, not in space travel', () => {
    const meta = {
      chunkIndex: 0,
      nextChunkIndex: 1,
      center: { lat: 0, lng: 0 },
      timePeriod: '2020-03',
      travel: 'time' as const,
      periods: ['2020-03', '2020-04', '2020-05'],
      barStarts: [0, 10, 20],
      stops: [],
      stopSeconds: 30,
      radiusDeg: 2,
      values: {},
    };
    // 12 s into groove 0: 2000 + 4 synthetic months
    const store = createPositionStore(2000 + 4 / 12);
    setup({ chunkIndex: 0, current: meta, positionStore: store });
    expect(screen.getByTestId('vinyl-date')).toHaveTextContent('Date: April 2020');
  });

  it('has no date in space travel', () => {
    setup({ current: { chunkIndex: 2, nextChunkIndex: 3, center: { lat: 0, lng: 0 }, timePeriod: '2020-03', travel: 'space', periods: ['2020-03'], barStarts: null, stops: [], stopSeconds: 3, radiusDeg: 2, values: {} } });
    expect(screen.queryByTestId('vinyl-date')).not.toBeInTheDocument();
  });
});
