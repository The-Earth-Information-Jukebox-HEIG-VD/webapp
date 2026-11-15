import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '../../i18n';
import { Timeline, buildTicks } from './Timeline';

function setup(overrides = {}) {
  const onSeek = vi.fn();
  const onSeekToYear = vi.fn();
  const utils = render(
    <Timeline
      progress={0.5}
      currentYear={1950}
      startYear={1880}
      endYear={2025}
      position={1950 + 2 / 12}
      timelineEnd={2026}
      onSeek={onSeek}
      onSeekToYear={onSeekToYear}
      {...overrides}
    />
  );
  return { onSeek, onSeekToYear, ...utils };
}

describe('Timeline', () => {
  it('exposes month and year as aria-valuetext', () => {
    setup();
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', 'March 1950');
  });

  it('PageUp/PageDown seek by one year, Shift+Arrow by one month', () => {
    const { onSeekToYear, onSeek } = setup();
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'PageUp' });
    expect(onSeekToYear).toHaveBeenLastCalledWith(1950 + 2 / 12 + 1);
    fireEvent.keyDown(slider, { key: 'PageDown' });
    expect(onSeekToYear).toHaveBeenLastCalledWith(1950 + 2 / 12 - 1);
    fireEvent.keyDown(slider, { key: 'ArrowRight', shiftKey: true });
    expect(onSeekToYear).toHaveBeenLastCalledWith(1950 + 3 / 12);
    fireEvent.keyDown(slider, { key: 'ArrowLeft', shiftKey: true });
    expect(onSeekToYear.mock.lastCall![0]).toBeCloseTo(1950 + 1 / 12, 9);
    expect(onSeek).not.toHaveBeenCalled();
  });

  it('plain arrows still use the 2% step', () => {
    const { onSeek } = setup();
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' });
    expect(onSeek).toHaveBeenCalledWith(0.52);
  });

  it('ticks are aria-hidden and labelled every 50 years on a long span', () => {
    const { container } = setup();
    const labels = [...container.querySelectorAll('.marker-year')].map((n) => n.textContent);
    expect(labels).toEqual(['1900', '1950', '2000']);
    expect(container.querySelector('.track-markers')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelectorAll('.track-marker.minor').length).toBeGreaterThan(100);
  });

  it('buildTicks classifies minor, medium and major years', () => {
    const ticks = buildTicks(1980, 2025, 2026);
    const kind = (y: number) => ticks.find((t) => t.year === y)?.kind;
    expect(kind(1981)).toBe('minor');
    expect(kind(1985)).toBe('medium');
    expect(kind(1990)).toBe('major');
    expect(ticks.filter((t) => t.label).map((t) => t.year)).toEqual([1980, 1990, 2000, 2010, 2020]);
  });

  it('shows a hover preview with month and year', () => {
    setup();
    const slider = screen.getByRole('slider');
    slider.getBoundingClientRect = () =>
      ({ left: 0, width: 1000, top: 0, height: 40, right: 1000, bottom: 40, x: 0, y: 0, toJSON: () => {} }) as DOMRect;
    fireEvent.mouseMove(slider, { clientX: 0 });
    expect(document.querySelector('.track-hover')).toHaveTextContent('Jan 1880');
    fireEvent.mouseLeave(slider);
    expect(document.querySelector('.track-hover')).toBeNull();
  });
});

describe('Timeline CSS tokens', () => {
  it('tooltip text uses a defined token (not the undefined --color-bg)', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/components/player/Timeline.css', 'utf8');
    expect(css).not.toMatch(/var\(--color-bg[,)]/);
    expect(css).toMatch(/\.track-hover[^}]*color: var\(--color-text-inverse\)/);
  });
});
