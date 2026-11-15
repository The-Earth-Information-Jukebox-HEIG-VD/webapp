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
  onShowTracks: noop,
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

  it('Sounds button is labelled with the count and calls onShowTracks', async () => {
    let shown = 0;
    const { container } = render(
      <AudioPlayerEnhanced
        {...base}
        trackStates={[{ id: 'a', enabled: true }, { id: 'b', enabled: true }]}
        onShowTracks={() => (shown += 1)}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sounds: 2 selected' }));
    expect(shown).toBe(1);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Sounds button toggles the track panel and reports aria-expanded', () => {
    let toggled = 0;
    let shown = 0;
    render(
      <AudioPlayerEnhanced
        {...base}
        trackStates={[{ id: 'a', enabled: true }]}
        onShowTracks={() => (shown += 1)}
        onToggleTracks={() => (toggled += 1)}
        tracksExpanded
      />
    );
    const button = screen.getByRole('button', { name: 'Sounds: 1 selected' });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(button);
    expect(toggled).toBe(1);
    expect(shown).toBe(0);
  });

  it('offers a "Choose sounds" button when no track is selected', async () => {
    let shown = 0;
    const { container } = render(
      <AudioPlayerEnhanced {...base} canPlay={false} onShowTracks={() => (shown += 1)} />
    );
    fireEvent.click(screen.getByRole('button', { name: /choose sounds/i }));
    expect(shown).toBe(1);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Space on a focused button (e.g. a track row) does not start playback', () => {
    let played = false;
    render(
      <>
        <AudioPlayerEnhanced {...base} onPlay={() => (played = true)} />
        <button type="button">row</button>
      </>
    );
    fireEvent.keyDown(screen.getByRole('button', { name: 'row' }), { key: ' ' });
    expect(played).toBe(false);
  });

  it('shows the date as a picker button with month and year', () => {
    render(<AudioPlayerEnhanced {...base} currentYear={1950} position={1950 + 2 / 12} timelineEnd={2026} />);
    const btn = screen.getByRole('button', { name: /go to a date, currently mar 1950/i });
    expect(btn).toHaveAttribute('aria-haspopup', 'dialog');
    expect(screen.getByRole('slider', { name: /timeline/i })).toHaveAttribute('aria-valuetext', 'March 1950');
  });

  it('global shortcuts do not hijack keys on buttons inside the date picker dialog', () => {
    let seeked = 0;
    let muted = 0;
    render(
      <AudioPlayerEnhanced
        {...base}
        onSeek={() => {
          seeked++;
        }}
        onVolumeChange={() => {
          muted++;
        }}
        currentYear={1950}
        position={1950 + 2 / 12}
        timelineEnd={2026}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /go to a date/i }));
    const go = screen.getByRole('button', { name: 'Go' });
    for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'm']) fireEvent.keyDown(go, { key });
    expect(seeked).toBe(0);
    expect(muted).toBe(0);
  });
});

describe('AudioPlayerEnhanced data graph accessibility', () => {
  const graph = (on: boolean, onToggle = () => {}) => ({
    on,
    onToggle,
    content: () => <div data-testid="chart">chart</div>,
  });

  it('has no Graph button without the graph prop', () => {
    render(<AudioPlayerEnhanced {...base} />);
    expect(screen.queryByRole('button', { name: /show data graph/i })).toBeNull();
  });

  it('Graph toggle reflects aria-pressed and calls onToggle', async () => {
    let toggled = 0;
    const { container, rerender } = render(
      <AudioPlayerEnhanced {...base} graph={graph(false, () => (toggled += 1))} />
    );
    const btn = screen.getByRole('button', { name: /show data graph/i });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('chart')).toBeNull();
    fireEvent.click(btn);
    expect(toggled).toBe(1);
    rerender(<AudioPlayerEnhanced {...base} graph={graph(true)} />);
    expect(screen.getByRole('button', { name: /show data graph/i })).toHaveAttribute('aria-pressed', 'true');
    expect(container.querySelector('.audio-player-enhanced')).toHaveClass('has-chart');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders the chart before the timeline slider in DOM order', () => {
    render(<AudioPlayerEnhanced {...base} graph={graph(true)} />);
    const chart = screen.getByTestId('chart');
    const slider = screen.getByRole('slider', { name: /timeline/i });
    expect(chart.compareDocumentPosition(slider) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
