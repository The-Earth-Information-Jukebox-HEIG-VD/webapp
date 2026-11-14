import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'jest-axe';
import '../../i18n';
import { TrackSelector } from './TrackSelector';
import { instrumentToTrack } from '../../hooks/useInstruments';
import type { InstrumentInfo } from '../../services/sonificationApi';

const info = (over: Partial<InstrumentInfo>): InstrumentInfo => ({
  dataset_id: 'temperature', variable: 'surface_temperature', label: 'Temperature',
  instrument: 'Piano (chords)', role: 'harmony', always_playing: true, units: 'degC',
  available: true, real_data: true, time_start: '1880-01-15T00:00:00Z', time_end: '2025-12-15T00:00:00Z',
  found_in: [], midi_program: 0, pitch_range: [48, 72], ...over,
});

const tracks = [
  instrumentToTrack(info({})),
  instrumentToTrack(info({ dataset_id: 'snowfall', label: 'Snowfall', available: false })),
];

describe('TrackSelector accessibility', () => {
  it('ready state: labelled checkboxes, disabled track explained, no axe violations', async () => {
    const onToggle = vi.fn();
    const { container } = render(
      <TrackSelector
        tracks={tracks}
        trackStates={[{ id: 'temperature', enabled: true }, { id: 'snowfall', enabled: false }]}
        status="ready"
        onTrackToggle={onToggle}
        onRetry={() => {}}
      />
    );
    const temp = screen.getByRole('checkbox', { name: /temperature/i });
    expect(temp).toBeChecked();
    expect(screen.getAllByText('Piano (chords)')[0]).toBeInTheDocument();
    const snow = screen.getByRole('checkbox', { name: /snowfall/i });
    expect(snow).toBeDisabled();
    expect(snow).toHaveAccessibleDescription(/not available/i);
    fireEvent.click(temp);
    expect(onToggle).toHaveBeenCalledWith('temperature', false);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('loading state is aria-busy', async () => {
    const { container } = render(
      <TrackSelector tracks={[]} trackStates={[]} status="loading" onTrackToggle={() => {}} onRetry={() => {}} />
    );
    // aria-busy only on the list, never on an ancestor of the live region
    expect(container.querySelector('.track-list')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('group')).not.toHaveAttribute('aria-busy');
    expect(container.querySelector('.sr-only[role="status"]')).toHaveTextContent(/loading tracks/i);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('error state is an alert with a working Retry button', async () => {
    const onRetry = vi.fn();
    const { container } = render(
      <TrackSelector tracks={[]} trackStates={[]} status="error" errorKind="backendUnavailable" onTrackToggle={() => {}} onRetry={onRetry} />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/cannot be reached/i);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalled();
    expect(await axe(container)).toHaveNoViolations();
  });
});
