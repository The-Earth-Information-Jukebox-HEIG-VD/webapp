import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'jest-axe';
import { AudioPlayer } from './AudioPlayer';

const defaultProps = {
  isPlaying: false,
  progress: 0.5,
  onPlay: vi.fn(),
  onPause: vi.fn(),
  onStop: vi.fn(),
  onSeek: vi.fn(),
  datasetName: 'Global Temperature Anomalies',
};

describe('AudioPlayer accessibility', () => {
  it('should have no axe accessibility violations', async () => {
    const { container } = render(<AudioPlayer {...defaultProps} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('should have accessible play/pause button with proper label', () => {
    const { rerender } = render(<AudioPlayer {...defaultProps} isPlaying={false} />);

    const playButton = screen.getByRole('button', { name: /play sonification/i });
    expect(playButton).toBeInTheDocument();

    rerender(<AudioPlayer {...defaultProps} isPlaying={true} />);

    const pauseButton = screen.getByRole('button', { name: /pause sonification/i });
    expect(pauseButton).toBeInTheDocument();
  });

  it('should have accessible stop button', () => {
    render(<AudioPlayer {...defaultProps} />);

    const stopButton = screen.getByRole('button', { name: /stop and reset/i });
    expect(stopButton).toBeInTheDocument();
  });

  it('should have accessible progress slider with proper ARIA attributes', () => {
    render(<AudioPlayer {...defaultProps} progress={0.75} />);

    const slider = screen.getByRole('slider', { name: /playback progress/i });
    expect(slider).toBeInTheDocument();
    expect(slider).toHaveAttribute('aria-valuenow', '75');
    expect(slider).toHaveAttribute('aria-valuetext', '75% complete');
  });

  it('should have live region announcing play state', () => {
    const { rerender } = render(<AudioPlayer {...defaultProps} isPlaying={false} />);

    const status = screen.getByText('Paused');
    expect(status).toHaveAttribute('aria-live', 'polite');

    rerender(<AudioPlayer {...defaultProps} isPlaying={true} />);

    expect(screen.getByText('Playing')).toBeInTheDocument();
  });

  it('should have region role with dataset name label', () => {
    render(<AudioPlayer {...defaultProps} />);

    const region = screen.getByRole('region', { name: /audio player for global temperature anomalies/i });
    expect(region).toBeInTheDocument();
  });
});

describe('AudioPlayer keyboard navigation', () => {
  it('should toggle play/pause with Space key', () => {
    const onPlay = vi.fn();
    const onPause = vi.fn();
    const { rerender } = render(
      <AudioPlayer {...defaultProps} onPlay={onPlay} onPause={onPause} isPlaying={false} />
    );

    const region = screen.getByRole('region');
    fireEvent.keyDown(region, { key: ' ' });
    expect(onPlay).toHaveBeenCalled();

    rerender(
      <AudioPlayer {...defaultProps} onPlay={onPlay} onPause={onPause} isPlaying={true} />
    );
    fireEvent.keyDown(region, { key: ' ' });
    expect(onPause).toHaveBeenCalled();
  });

  it('should seek backward with ArrowLeft', () => {
    const onSeek = vi.fn();
    render(<AudioPlayer {...defaultProps} onSeek={onSeek} progress={0.5} />);

    const region = screen.getByRole('region');
    fireEvent.keyDown(region, { key: 'ArrowLeft' });

    expect(onSeek).toHaveBeenCalledWith(0.45);
  });

  it('should seek forward with ArrowRight', () => {
    const onSeek = vi.fn();
    render(<AudioPlayer {...defaultProps} onSeek={onSeek} progress={0.5} />);

    const region = screen.getByRole('region');
    fireEvent.keyDown(region, { key: 'ArrowRight' });

    expect(onSeek).toHaveBeenCalledWith(0.55);
  });

  it('should jump to start with Home key', () => {
    const onSeek = vi.fn();
    render(<AudioPlayer {...defaultProps} onSeek={onSeek} progress={0.5} />);

    const region = screen.getByRole('region');
    fireEvent.keyDown(region, { key: 'Home' });

    expect(onSeek).toHaveBeenCalledWith(0);
  });

  it('should jump to end with End key', () => {
    const onSeek = vi.fn();
    render(<AudioPlayer {...defaultProps} onSeek={onSeek} progress={0.5} />);

    const region = screen.getByRole('region');
    fireEvent.keyDown(region, { key: 'End' });

    expect(onSeek).toHaveBeenCalledWith(1);
  });

  it('should be focusable via tab navigation', () => {
    render(<AudioPlayer {...defaultProps} />);

    const playButton = screen.getByRole('button', { name: /play sonification/i });
    const stopButton = screen.getByRole('button', { name: /stop and reset/i });
    const slider = screen.getByRole('slider');

    // All interactive elements should be focusable
    expect(playButton).not.toHaveAttribute('tabindex', '-1');
    expect(stopButton).not.toHaveAttribute('tabindex', '-1');
    expect(slider).not.toHaveAttribute('tabindex', '-1');
  });
});
