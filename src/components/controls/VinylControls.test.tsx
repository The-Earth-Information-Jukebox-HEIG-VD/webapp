import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'jest-axe';
import '../../i18n';
import { VinylControls } from './VinylControls';
import { ExperienceModeSwitch } from './ExperienceModeSwitch';
import { usePlayerShortcuts } from '../../hooks/usePlayerShortcuts';

const range = { start: '2017-03', end: '2022-03', disjoint: false };

function renderControls(overrides: Partial<Parameters<typeof VinylControls>[0]> = {}) {
  const onCenterChange = vi.fn();
  const onTimePeriodChange = vi.fn();
  const onTravelChange = vi.fn();
  const onStepChange = vi.fn();
  const utils = render(
    <VinylControls
      center={{ lat: 50, lng: 10 }}
      onCenterChange={onCenterChange}
      timePeriod="2020-03"
      onTimePeriodChange={onTimePeriodChange}
      range={range}
      clamped={false}
      travel="space"
      onTravelChange={onTravelChange}
      step="year"
      onStepChange={onStepChange}
      {...overrides}
    />
  );
  return { ...utils, onCenterChange, onTimePeriodChange, onTravelChange, onStepChange };
}

describe('VinylControls', () => {
  it('has no accessibility violations', async () => {
    const { container } = renderControls();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows the preset matching the centre and its coordinates', () => {
    renderControls();
    expect((screen.getByLabelText('Place') as HTMLSelectElement).value).toBe('europe');
    expect((screen.getByLabelText('Latitude') as HTMLInputElement).value).toBe('50');
    expect((screen.getByLabelText('Longitude') as HTMLInputElement).value).toBe('10');
  });

  it('a preset sets the centre', () => {
    const { onCenterChange } = renderControls();
    fireEvent.change(screen.getByLabelText('Place'), { target: { value: 'south-pole' } });
    expect(onCenterChange).toHaveBeenCalledWith({ lat: -90, lng: 0 });
  });

  it('a custom centre shows "Custom position" and syncs the fields', () => {
    const { rerender, onCenterChange, onTimePeriodChange } = renderControls();
    rerender(
      <VinylControls
        center={{ lat: 12.3, lng: -45.6 }}
        onCenterChange={onCenterChange}
        timePeriod="2020-03"
        onTimePeriodChange={onTimePeriodChange}
        range={range}
        clamped={false}
        travel="space"
        onTravelChange={() => {}}
        step="year"
        onStepChange={() => {}}
      />
    );
    expect((screen.getByLabelText('Place') as HTMLSelectElement).value).toBe('custom');
    expect((screen.getByLabelText('Latitude') as HTMLInputElement).value).toBe('12.3');
  });

  it('rejects an out-of-range latitude and does not change the centre', () => {
    const { onCenterChange } = renderControls();
    const lat = screen.getByLabelText('Latitude');
    fireEvent.change(lat, { target: { value: '95' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onCenterChange).not.toHaveBeenCalled();
    expect(lat).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Latitude must be between -90 and 90.')).toBeInTheDocument();
  });

  it('commits valid coordinates (comma decimals too)', () => {
    const { onCenterChange } = renderControls();
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '-33,9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onCenterChange).toHaveBeenCalledWith({ lat: -33.9, lng: 10 });
  });

  it('offers only months with data', () => {
    const { onTimePeriodChange } = renderControls({ timePeriod: '2017-05' });
    const march = screen.getByRole('option', { name: 'February' }) as HTMLOptionElement;
    expect(march.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '2022' } });
    // May 2022 is after the data: moved to the last month
    expect(onTimePeriodChange).toHaveBeenCalledWith('2022-03');
  });
});

describe('ExperienceModeSwitch', () => {
  it('marks the current mode and switches', async () => {
    const onChange = vi.fn();
    const { container } = render(<ExperienceModeSwitch value="zones" onChange={onChange} />);
    const zones = screen.getByRole('button', { name: /Time travel/ });
    const vinyl = screen.getByRole('button', { name: /Vinyl/ });
    expect(zones).toHaveAttribute('aria-pressed', 'true');
    expect(vinyl).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(vinyl);
    expect(onChange).toHaveBeenCalledWith('vinyl');
    fireEvent.click(zones);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('offers three ways to travel as radios in a labelled group', async () => {
    const { container, onTravelChange } = renderControls();
    const group = screen.getByRole('group', { name: 'The needle travels through' });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    // The name is the short label only; the hint is the description
    expect(screen.getByRole('radio', { name: 'Space' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Both' })).toHaveAccessibleDescription(/date moves on each groove/i);
    expect(group).toHaveAccessibleDescription(/starts the record again/i);
    expect(screen.getByRole('radio', { name: /Time/ })).toHaveAccessibleDescription(/one place/i);
    fireEvent.click(screen.getByRole('radio', { name: /Time/ }));
    expect(onTravelChange).toHaveBeenCalledWith('time');
    expect(screen.queryByLabelText('The date moves on by')).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows the step only when travelling through both', async () => {
    const { container, onStepChange } = renderControls({ travel: 'both' });
    fireEvent.change(screen.getByLabelText('The date moves on by'), { target: { value: 'month' } });
    expect(onStepChange).toHaveBeenCalledWith('month');
    expect(screen.getByRole('group', { name: 'Starting month' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('VinylControls and global player shortcuts', () => {
  it('arrow keys on the radios and the step select do not reach the player', () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    function Harness() {
      usePlayerShortcuts({ onPlayPause: vi.fn(), onPrev, onNext, onFirst: vi.fn(), onLast: vi.fn(), onMute: vi.fn() });
      return (
        <VinylControls
          center={{ lat: 50, lng: 10 }}
          onCenterChange={() => {}}
          timePeriod="2020-03"
          onTimePeriodChange={() => {}}
          range={range}
          clamped={false}
          travel="both"
          onTravelChange={() => {}}
          step="year"
          onStepChange={() => {}}
        />
      );
    }
    render(<Harness />);
    for (const el of [screen.getByRole('radio', { name: 'Both' }), screen.getByLabelText('The date moves on by')]) {
      el.focus();
      const ev = fireEvent.keyDown(el, { key: 'ArrowRight' });
      expect(ev).toBe(true); // not preventDefault-ed: the radio/select keeps its arrow
    }
    expect(onNext).not.toHaveBeenCalled();
    expect(onPrev).not.toHaveBeenCalled();
  });
});
