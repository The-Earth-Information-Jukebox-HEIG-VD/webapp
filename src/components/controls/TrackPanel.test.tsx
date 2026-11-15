import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'jest-axe';
import '../../i18n';
import { TrackPanel } from './TrackPanel';
import { instrumentToTrack } from '../../hooks/useInstruments';
import type { InstrumentInfo } from '../../services/sonificationApi';

const info = (over: Partial<InstrumentInfo>): InstrumentInfo => ({
  dataset_id: 'temperature', name: 'Temperature', instrument: 'Piano (chords)', units: 'degC anomaly',
  first_time_period: '1880-01', last_time_period: '2025-12', midi_program: 0, pitch_range: [48, 72],
  role: 'harmony', always_playing: true, ...over,
});

const tracks = [
  instrumentToTrack(info({})),
  { ...instrumentToTrack(info({ dataset_id: 'snow', name: 'Snow', instrument: 'Flute' })), available: false },
  instrumentToTrack(info({ dataset_id: 'lightning', name: 'Lightning', instrument: 'Drums', always_playing: false })),
];
const states = [
  { id: 'temperature', enabled: true },
  { id: 'snow', enabled: false },
  { id: 'lightning', enabled: false },
];

describe('TrackPanel accessibility', () => {
  it('ready state: pressed rows, visible instrument and period, no axe violations', async () => {
    const { container } = render(
      <TrackPanel tracks={tracks} trackStates={states} status="ready" onTrackToggle={() => {}} onRetry={() => {}} />
    );
    expect(screen.getByRole('heading', { name: /what do you want to hear/i })).toBeInTheDocument();
    expect(screen.getByText('Piano (chords)')).toBeVisible();
    expect(screen.getByText('Flute')).toBeVisible();
    expect(screen.getByText('Drums')).toBeVisible();
    expect(screen.getAllByText(/from 1880 to 2025/i).length).toBe(2);
    expect(screen.getByText(/only when present/i)).toBeVisible();
    expect(screen.getByRole('button', { name: /temperature/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /lightning/i })).toHaveAttribute('aria-pressed', 'false');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('rows are native buttons (Enter/Space activate natively) and toggle on click', () => {
    const onToggle = vi.fn();
    render(
      <TrackPanel tracks={tracks} trackStates={states} status="ready" onTrackToggle={onToggle} onRetry={() => {}} />
    );
    const temp = screen.getByRole('button', { name: /temperature/i });
    expect(temp.tagName).toBe('BUTTON');
    expect(temp).toHaveAttribute('type', 'button');
    fireEvent.click(temp);
    expect(onToggle).toHaveBeenLastCalledWith('temperature', false);
    fireEvent.click(screen.getByRole('button', { name: /lightning/i }));
    expect(onToggle).toHaveBeenLastCalledWith('lightning', true);
  });

  it('unavailable track is aria-disabled, explained, and does not toggle', () => {
    const onToggle = vi.fn();
    render(
      <TrackPanel tracks={tracks} trackStates={states} status="ready" onTrackToggle={onToggle} onRetry={() => {}} />
    );
    const snow = screen.getByRole('button', { name: /snow/i });
    expect(snow).toHaveAttribute('aria-disabled', 'true');
    expect(snow).toHaveAccessibleDescription(/not available/i);
    fireEvent.click(snow);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('loading state is aria-busy with a live message and no axe violations', async () => {
    const { container } = render(
      <TrackPanel tracks={[]} trackStates={[]} status="loading" onTrackToggle={() => {}} onRetry={() => {}} />
    );
    expect(container.querySelector('.track-panel-list')).toHaveAttribute('aria-busy', 'true');
    expect(container.querySelector('.sr-only[role="status"]')).toHaveTextContent(/loading tracks/i);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('error state is an alert; Retry works and focus returns to the panel', async () => {
    const onRetry = vi.fn();
    const { container } = render(
      <TrackPanel tracks={[]} trackStates={[]} status="error" errorKind="backendUnavailable" onTrackToggle={() => {}} onRetry={onRetry} />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/cannot be reached/i);
    expect(await axe(container)).toHaveNoViolations();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalled();
    expect(container.querySelector('.track-panel')).toHaveFocus();
  });

  it('preparing and none-selected messages', () => {
    const { container, rerender } = render(
      <TrackPanel tracks={tracks} trackStates={states} status="ready" preparing onTrackToggle={() => {}} onRetry={() => {}} />
    );
    expect(container.querySelector('.sr-only[role="status"]')).toHaveTextContent(/preparing/i);
    rerender(
      <TrackPanel tracks={tracks} trackStates={states.map((s) => ({ ...s, enabled: false }))} status="ready" onTrackToggle={() => {}} onRetry={() => {}} />
    );
    expect(container.querySelector('.sr-only[role="status"]')).toHaveTextContent(/no track selected/i);
    expect(container.querySelector('.track-panel-status')).toBeInTheDocument();
  });

  it('sounding indicator appears only for ids in soundingIds', () => {
    const on = states.map((s) => ({ ...s, enabled: s.id !== 'snow' }));
    render(
      <TrackPanel tracks={tracks} trackStates={on} status="ready" soundingIds={new Set(['temperature'])} onTrackToggle={() => {}} onRetry={() => {}} />
    );
    const marks = screen.getAllByTestId('sounding');
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('button', { name: /temperature/i })).toContainElement(marks[0]);
  });
});

describe('TrackPanel show/hide', () => {
  it('heading is a disclosure button that hides the rows and shows a summary', async () => {
    const onOpenChange = vi.fn();
    const props = { tracks, trackStates: states, status: 'ready' as const, onTrackToggle: () => {}, onRetry: () => {}, onOpenChange };
    const { container, rerender } = render(<TrackPanel {...props} open />);
    const toggle = screen.getByRole('button', { name: /what do you want to hear/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAttribute('aria-controls', 'track-panel-body');
    expect(screen.getByRole('heading', { name: /what do you want to hear/i })).toContainElement(toggle);
    fireEvent.click(toggle);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);

    rerender(<TrackPanel {...props} open={false} />);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /temperature/i })).not.toBeInTheDocument();
    expect(screen.getByText('1 track selected')).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
    fireEvent.click(toggle);
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
  });

  it('without onOpenChange the heading stays plain text (always open)', () => {
    render(<TrackPanel tracks={tracks} trackStates={states} status="ready" onTrackToggle={() => {}} onRetry={() => {}} />);
    expect(screen.queryByRole('button', { name: /what do you want to hear/i })).not.toBeInTheDocument();
  });
});
