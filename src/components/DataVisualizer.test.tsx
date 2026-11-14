import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'jest-axe';
import { DataVisualizer } from './DataVisualizer';
import type { ClimateDataPoint } from '../types';

// Generate sample data for testing
const generateTestData = (count: number): ClimateDataPoint[] => {
  return Array.from({ length: count }, (_, i) => ({
    timestamp: new Date(1880 + i, 0, 1),
    value: Math.sin(i * 0.1) * 0.5,
    anomaly: (i - count / 2) * 0.02,
  }));
};

const defaultProps = {
  data: generateTestData(10),
  currentIndex: 5,
  unit: '°C',
};

describe('DataVisualizer accessibility', () => {
  it('should have no axe accessibility violations', async () => {
    const { container } = render(<DataVisualizer {...defaultProps} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('should have accessible chart with descriptive label', () => {
    render(<DataVisualizer {...defaultProps} />);

    const chart = screen.getByRole('group', { name: /bar chart showing/i });
    expect(chart).toBeInTheDocument();
  });

  it('should have accessible listbox for interactive bars', () => {
    render(<DataVisualizer {...defaultProps} />);

    const listbox = screen.getByRole('listbox', { name: /temperature anomaly data points/i });
    expect(listbox).toBeInTheDocument();
  });

  it('should have accessible options for each data bar', () => {
    const data = generateTestData(5);
    render(<DataVisualizer data={data} currentIndex={2} unit="°C" />);

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(5);

    // Each option should have an accessible label
    options.forEach((option) => {
      expect(option).toHaveAttribute('aria-label');
    });
  });

  it('should mark active bar as selected', () => {
    const data = generateTestData(5);
    render(<DataVisualizer data={data} currentIndex={2} unit="°C" />);

    const options = screen.getAllByRole('option');
    expect(options[2]).toHaveAttribute('aria-selected', 'true');

    // Other options should not be selected
    expect(options[0]).toHaveAttribute('aria-selected', 'false');
    expect(options[4]).toHaveAttribute('aria-selected', 'false');
  });

  it('should have hidden table with complete data for screen readers', () => {
    const data = generateTestData(5);
    render(<DataVisualizer data={data} currentIndex={0} unit="°C" />);

    // The table should exist (for screen readers)
    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();

    // Table should have proper structure
    expect(screen.getByRole('columnheader', { name: /year/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /value/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /trend/i })).toBeInTheDocument();

    // Data rows should be present
    const rows = screen.getAllByRole('row');
    expect(rows.length).toBe(6); // 1 header + 5 data rows
  });
});

describe('DataVisualizer keyboard navigation', () => {
  it('should navigate with arrow keys', () => {
    const data = generateTestData(5);
    const onBarSelect = vi.fn();
    render(
      <DataVisualizer data={data} currentIndex={2} unit="°C" onBarSelect={onBarSelect} />
    );

    const options = screen.getAllByRole('option');

    // Focus first bar
    options[0].focus();
    expect(document.activeElement).toBe(options[0]);

    // Navigate right
    fireEvent.keyDown(options[0], { key: 'ArrowRight' });
    expect(document.activeElement).toBe(options[1]);

    // Navigate left
    fireEvent.keyDown(options[1], { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(options[0]);
  });

  it('should jump to start with Home key', () => {
    const data = generateTestData(5);
    render(<DataVisualizer data={data} currentIndex={0} unit="°C" />);

    const options = screen.getAllByRole('option');

    // Focus middle bar
    options[2].focus();

    // Press Home
    fireEvent.keyDown(options[2], { key: 'Home' });
    expect(document.activeElement).toBe(options[0]);
  });

  it('should jump to end with End key', () => {
    const data = generateTestData(5);
    render(<DataVisualizer data={data} currentIndex={0} unit="°C" />);

    const options = screen.getAllByRole('option');

    // Focus first bar
    options[0].focus();

    // Press End
    fireEvent.keyDown(options[0], { key: 'End' });
    expect(document.activeElement).toBe(options[4]);
  });

  it('should trigger selection with Enter or Space', () => {
    const data = generateTestData(5);
    const onBarSelect = vi.fn();
    render(
      <DataVisualizer data={data} currentIndex={0} unit="°C" onBarSelect={onBarSelect} />
    );

    const options = screen.getAllByRole('option');

    // Focus and press Enter
    options[2].focus();
    fireEvent.keyDown(options[2], { key: 'Enter' });
    expect(onBarSelect).toHaveBeenCalledWith(2);

    // Press Space
    options[3].focus();
    fireEvent.keyDown(options[3], { key: ' ' });
    expect(onBarSelect).toHaveBeenCalledWith(3);
  });

  it('should handle click selection', () => {
    const data = generateTestData(5);
    const onBarSelect = vi.fn();
    render(
      <DataVisualizer data={data} currentIndex={0} unit="°C" onBarSelect={onBarSelect} />
    );

    const options = screen.getAllByRole('option');
    fireEvent.click(options[2]);

    expect(onBarSelect).toHaveBeenCalledWith(2);
  });

  it('should respect navigation boundaries', () => {
    const data = generateTestData(5);
    render(<DataVisualizer data={data} currentIndex={0} unit="°C" />);

    const options = screen.getAllByRole('option');

    // Try to go before first
    options[0].focus();
    fireEvent.keyDown(options[0], { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(options[0]); // Should stay at first

    // Try to go after last
    options[4].focus();
    fireEvent.keyDown(options[4], { key: 'ArrowRight' });
    expect(document.activeElement).toBe(options[4]); // Should stay at last
  });

  it('should have proper focus indicators', () => {
    const data = generateTestData(5);
    render(<DataVisualizer data={data} currentIndex={0} unit="°C" />);

    const options = screen.getAllByRole('option');

    // First item should be tabbable
    expect(options[0]).toHaveAttribute('tabindex', '0');

    // Other items should not be in tab order initially
    expect(options[1]).toHaveAttribute('tabindex', '-1');
    expect(options[2]).toHaveAttribute('tabindex', '-1');
  });
});

describe('DataVisualizer empty state', () => {
  it('should display empty message when no data', () => {
    render(<DataVisualizer data={[]} currentIndex={0} unit="°C" />);

    expect(screen.getByText(/no data to display/i)).toBeInTheDocument();
  });

  it('should have no accessibility violations in empty state', async () => {
    const { container } = render(<DataVisualizer data={[]} currentIndex={0} unit="°C" />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
