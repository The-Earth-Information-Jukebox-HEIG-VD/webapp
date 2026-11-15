import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'jest-axe';
import '../../i18n';
import { MonthTravelControl } from './MonthTravelControl';

const range = { start: 1880, end: 2025 };

describe('MonthTravelControl accessibility', () => {
  it('is a labelled select with a hint, and has no axe violations', async () => {
    const { container } = render(<MonthTravelControl month={null} onChange={() => {}} yearRange={range} />);
    const select = screen.getByRole('combobox', { name: 'Months' });
    expect(select).toHaveValue('');
    expect(select).toHaveAccessibleDescription(/each July/i);
    expect(screen.getAllByRole('option')).toHaveLength(13);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows what is playing when a month is chosen', async () => {
    const { container } = render(<MonthTravelControl month={7} onChange={() => {}} yearRange={range} />);
    expect(screen.getByRole('combobox')).toHaveValue('7');
    expect(screen.getByRole('combobox')).toHaveAccessibleDescription('Each July, 1880–2025');
    expect(screen.getByText('Each July, 1880–2025')).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('reports the month, and null for every month', () => {
    const onChange = vi.fn();
    render(<MonthTravelControl month={null} onChange={onChange} yearRange={range} />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '7' } });
    expect(onChange).toHaveBeenLastCalledWith(7);
    fireEvent.change(select, { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
