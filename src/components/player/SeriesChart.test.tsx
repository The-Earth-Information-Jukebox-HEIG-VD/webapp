import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { axe } from 'jest-axe';
import '../../i18n';
import {
  SeriesChart,
  buildLinePath,
  buildDotsPath,
  seriesRange,
  yearToX,
  dashFor,
  valueToY,
  MARGIN_Y,
  VIEW_H,
  VIEW_W,
  type ChartLine,
} from './SeriesChart';
import type { DatasetSeries } from '../../services/sonificationApi';

const temp: DatasetSeries = {
  units: 'degC anomaly',
  anomaly: true,
  start: '1880-01',
  yearly: false,
  // 24 months: 1880 = -0.5 .. , 1881 = +0.5
  values: [...Array(12).fill(-0.5), ...Array(12).fill(0.5)],
};
const co2: DatasetSeries = {
  units: 'ppm',
  anomaly: false,
  start: '1880-01',
  yearly: false,
  values: [null, null, 300, 310, null, 320],
};

const lines: ChartLine[] = [
  { id: 'temperature', name: 'Temperature', color: '#e78615', series: temp },
  { id: 'co2', name: 'CO₂', color: '#c990fc', series: co2 },
];

const base = {
  lines,
  status: 'ready' as const,
  zoneName: 'Europe',
  startYear: 1880,
  endYear: 1881,
  timelineEnd: 1882,
  position: 1880 + 2 / 12,
  hoverFraction: null,
  onHoverChange: () => {},
  onSeek: () => {},
};

describe('SeriesChart geometry', () => {
  it('x follows the Timeline formula', () => {
    expect(yearToX(1880, 1880, 1882)).toBe(0);
    expect(yearToX(1881, 1880, 1882)).toBe(VIEW_W / 2);
    expect(yearToX(1882, 1880, 1882)).toBe(VIEW_W);
    const d = buildLinePath(temp, 1880, 1882);
    // second month of 1880 sits at (1/12) / 2 of the width
    expect(d).toContain(`L${((1 / 12 / 2) * VIEW_W).toFixed(2)} `);
  });

  it('a null value makes a gap: two sub-paths', () => {
    const d = buildLinePath({ ...co2, values: [1, 2, null, 3, 4] }, 1880, 1882);
    expect(d.match(/M/g)).toHaveLength(2);
  });

  it('keeps y within the margins', () => {
    const d = buildLinePath(co2, 1880, 1882);
    const ys = [...d.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map((m) => Number(m[2]));
    expect(ys.length).toBeGreaterThan(0);
    for (const y of ys) {
      expect(y).toBeGreaterThanOrEqual(MARGIN_Y);
      expect(y).toBeLessThanOrEqual(VIEW_H - MARGIN_Y);
    }
    expect(valueToY(5, 0, 10)).toBe(VIEW_H / 2);
    expect(valueToY(3, 3, 3)).toBe(VIEW_H / 2);
  });

  it('draws yearly data as steps', () => {
    const yearly: DatasetSeries = { ...co2, yearly: true, start: '1880-01', values: [1, ...Array(11).fill(null), 3] };
    const d = buildLinePath(yearly, 1880, 1882);
    expect(d).toBe(`M0.00 ${valueToY(1, 1, 3).toFixed(2)}L500.00 ${valueToY(1, 1, 3).toFixed(2)}L500.00 ${valueToY(3, 1, 3).toFixed(2)}L1000.00 ${valueToY(3, 1, 3).toFixed(2)}`);
  });
});

describe('SeriesChart', () => {
  it('has an image role with a summary label and a hidden yearly table with units', () => {
    const { container } = render(<SeriesChart {...base} />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('aria-label', expect.stringContaining('Europe'));
    expect(img.getAttribute('aria-label')).toMatch(/own scale/i);
    expect(img.getAttribute('aria-label')).toMatch(/lowest/i);

    const table = container.querySelector('table.sr-only') as HTMLElement;
    expect(table).not.toBeNull();
    expect(within(table).getByRole('columnheader', { name: /Temperature \(°C\)/ })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: /CO₂ \(ppm\)/ })).toBeInTheDocument();
    const rows = within(table).getAllByRole('row');
    // header + 1880 + 1881
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByRole('rowheader')).toHaveTextContent('1880');
  });

  it('reads the value at the position, or at the hover year', () => {
    const { rerender } = render(<SeriesChart {...base} />);
    const legend = screen.getByRole('list');
    expect(legend).toHaveTextContent('−0.5 °C vs normal');
    expect(legend).toHaveTextContent('0 = normal');
    // March 1880: no CO2 yet? values[2] = 300
    expect(legend).toHaveTextContent('300 ppm');
    // hover at 75% of the track = 1881.5
    rerender(<SeriesChart {...base} hoverFraction={0.75} />);
    expect(screen.getByRole('list')).toHaveTextContent('+0.5 °C vs normal');
    expect(screen.getByRole('list')).toHaveTextContent(/no data/i);
  });

  it('hover and click on the plot report fractions', () => {
    const onHoverChange = vi.fn();
    const onSeek = vi.fn();
    const { container } = render(<SeriesChart {...base} onHoverChange={onHoverChange} onSeek={onSeek} />);
    const plot = container.querySelector('.series-plot') as HTMLElement;
    plot.getBoundingClientRect = () => ({ left: 0, width: 200, top: 0, height: 72, right: 200, bottom: 72, x: 0, y: 0, toJSON: () => ({}) });
    const pointer = container.querySelector('.series-pointer') as HTMLElement;
    fireEvent.mouseMove(pointer, { clientX: 50 });
    expect(onHoverChange).toHaveBeenLastCalledWith(0.25);
    fireEvent.click(pointer, { clientX: 100 });
    expect(onSeek).toHaveBeenCalledWith(0.5);
    fireEvent.mouseLeave(pointer);
    expect(onHoverChange).toHaveBeenLastCalledWith(null);
    expect(pointer).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows loading, error with Retry, and empty states', () => {
    const onRetry = vi.fn();
    const { rerender } = render(<SeriesChart {...base} status="loading" lines={[]} />);
    expect(screen.getByText(/loading the data graph/i)).toBeInTheDocument();
    rerender(<SeriesChart {...base} status="error" errorKind="backendUnavailable" lines={[]} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalled();
    rerender(<SeriesChart {...base} status="idle" lines={[]} />);
    expect(screen.getByText(/select a zone and at least one sound/i)).toBeInTheDocument();
  });
});

describe('SeriesChart accessibility (axe)', () => {
  const cases: [string, { status?: 'loading' | 'idle'; lines?: ChartLine[] }][] = [
    ['loading', { status: 'loading', lines: [] }],
    ['ready', {}],
    ['empty', { status: 'idle', lines: [] }],
  ];
  for (const [name, props] of cases) {
    it(`has no axe violations in the ${name} state`, async () => {
      const { container } = render(<SeriesChart {...base} {...props} />);
      expect(await axe(container)).toHaveNoViolations();
    });
  }
});

describe('SeriesChart dashes', () => {
  const dashes = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('path.series-line')).map((p) => p.getAttribute('stroke-dasharray'));

  it('co2 keeps its dash whether one or two lines are shown', () => {
    const both = render(<SeriesChart {...base} lines={lines} />);
    const coBoth = dashes(both.container)[1];
    both.unmount();
    const alone = render(<SeriesChart {...base} lines={[lines[1]]} />);
    expect(dashes(alone.container)[0]).toBe(coBoth);
    expect(dashFor('co2')).toBe(coBoth ?? undefined);
  });

  it('every known track has its own dash pattern (1.4.1: not colour alone)', () => {
    const ids = ['temperature', 'precipitation', 'co2', 'snow', 'lightning', 'night_lights', 'fires'];
    expect(new Set(ids.map((id) => dashFor(id) ?? 'solid')).size).toBe(ids.length);
  });

  it('unknown ids get a deterministic dash', () => {
    expect(dashFor('mystery')).toBe(dashFor('mystery'));
  });
});

describe('SeriesChart sparse and empty data', () => {
  const sparse: DatasetSeries = {
    units: 'ppm',
    anomaly: false,
    start: '1880-01',
    yearly: false,
    // isolated months: index 1 and index 5, plus a 2-month run at 8-9
    values: [null, 400, null, null, null, 410, null, null, 420, 421, null],
  };
  const allNull: DatasetSeries = { ...sparse, values: Array(235).fill(null) };

  it('draws isolated single months as visible dots, not only zero-length M commands', () => {
    const dots = buildDotsPath(sparse, 1880, 1882);
    expect(dots.match(/M/g)).toHaveLength(2);
    expect(dots).toMatch(/h0\.01/);
    // the 2-month run is a real segment, not a dot
    expect(buildLinePath(sparse, 1880, 1882)).toContain('L');
    const { container } = render(
      <SeriesChart {...base} lines={[{ id: 'co2', name: 'CO₂', color: '#c990fc', series: sparse }]} />
    );
    const dotPath = container.querySelector('path.series-dots');
    expect(dotPath).not.toBeNull();
    expect(dotPath?.getAttribute('stroke-linecap')).toBe('round');
    expect(dotPath?.getAttribute('d')).not.toMatch(/NaN|Infinity/);
  });

  it('handles an all-null series without NaN or Infinity', () => {
    expect(seriesRange(allNull.values)).toBeNull();
    expect(buildLinePath(allNull, 1880, 1882)).toBe('');
    expect(buildDotsPath(allNull, 1880, 1882)).toBe('');
    const { container } = render(
      <SeriesChart {...base} lines={[{ id: 'co2', name: 'CO₂', color: '#c990fc', series: allNull }]} />
    );
    const label = screen.getByRole('img').getAttribute('aria-label') ?? '';
    expect(label).toMatch(/no data/i);
    expect(label).not.toMatch(/NaN|Infinity|undefined/);
    expect(screen.getByRole('list')).toHaveTextContent(/no data/i);
    expect(container.textContent).not.toMatch(/NaN|Infinity/);
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it('marks months without data as "No data" in the hidden table', () => {
    const late: DatasetSeries = { ...co2, start: '1881-01', values: [1, 2] };
    const { container } = render(
      <SeriesChart
        {...base}
        lines={[lines[0], { id: 'co2', name: 'CO₂', color: '#c990fc', series: late }]}
      />
    );
    const rows = within(container.querySelector('table.sr-only') as HTMLElement).getAllByRole('row');
    expect(within(rows[1]).getAllByRole('cell')[1]).toHaveTextContent(/no data/i);
  });
});
