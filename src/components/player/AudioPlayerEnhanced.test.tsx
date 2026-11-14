import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { axe } from 'jest-axe';
import '../../i18n';
import { AudioPlayerEnhanced } from './AudioPlayerEnhanced';

const noop = () => {};
const base = {
  isPlaying: false,
  progress: 0,
  currentYear: 1880,
  yearRange: { start: 1880, end: 2025 },
  trackStates: [],
  onPlay: noop,
  onPause: noop,
  onSeek: noop,
  onSeekToYear: noop,
  onVolumeChange: noop,
  onOpenTrackPanel: noop,
};

describe('AudioPlayerEnhanced accessibility', () => {
  it('blocked Play stays focusable, is described, and announces why when activated', async () => {
    let played = false;
    const { container } = render(
      <AudioPlayerEnhanced {...base} onPlay={() => (played = true)} playDisabled />
    );
    const play = screen.getByRole('button', { name: /play sonification/i });
    expect(play).not.toBeDisabled();
    expect(play).toHaveAttribute('aria-disabled', 'true');
    expect(play).toHaveAccessibleDescription(/select a zone/i);

    play.focus();
    expect(play).toHaveFocus();
    fireEvent.click(play);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });
    expect(played).toBe(false);
    // the permanently mounted live region carries the hint
    const live = container.querySelector('.sr-only[role="status"]');
    expect(live).toHaveTextContent(/select a zone/i);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no aria-busy ancestor around its live region and says "end of data" when finished', () => {
    const { container } = render(<AudioPlayerEnhanced {...base} hasEnded />);
    expect(container.querySelector('[aria-busy]')).toBeNull();
    expect(container.querySelector('.sr-only[role="status"]')).toHaveTextContent(/end of the data/i);
  });

  it('shows an error alert with a Retry button', () => {
    render(
      <AudioPlayerEnhanced
        {...base}
        status="error"
        error={{ kind: 'backendUnavailable', detail: '' }}
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/cannot be reached/i);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});
