import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { axe } from 'jest-axe';
import '../../i18n';
import { DatePicker } from './DatePicker';

const props = {
  position: 1950 + 2 / 12,
  yearRange: { start: 1880, end: 2025 },
  timelineEnd: 2025 + 4 / 12, // last data month: April 2025
};

describe('DatePicker', () => {
  it('opens on click and focuses the Year select', async () => {
    const { container } = render(<DatePicker {...props} onSeekToYear={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: /go to a date, currently mar 1950/i });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Year')).toHaveFocus();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('closes on Escape and restores focus to the trigger', async () => {
    render(<DatePicker {...props} onSeekToYear={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: /go to a date/i });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByLabelText('Year'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('closes on click outside', async () => {
    render(
      <div>
        <DatePicker {...props} onSeekToYear={vi.fn()} />
        <p>outside</p>
      </div>
    );
    fireEvent.click(screen.getByRole('button', { name: /go to a date/i }));
    fireEvent.mouseDown(screen.getByText('outside'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Go seeks to the chosen month and closes', async () => {
    const onSeek = vi.fn();
    render(<DatePicker {...props} onSeekToYear={onSeek} />);
    const trigger = screen.getByRole('button', { name: /go to a date/i });
    fireEvent.click(trigger);
    // opens on the current date: March 1950
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onSeek).toHaveBeenCalledWith(1950 + 2 / 12);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('disables months after the last data month in the final year', async () => {
    render(<DatePicker {...props} onSeekToYear={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /go to a date/i }));
    fireEvent.change(screen.getByLabelText('Month'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '2025' } });
    expect(screen.getByRole('option', { name: 'April' })).not.toBeDisabled();
    expect(screen.getByRole('option', { name: 'May' })).toBeDisabled();
    // selected month snapped to the last valid one
    expect(screen.getByLabelText('Month')).toHaveValue('4');
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '2024' } });
    expect(screen.getByRole('option', { name: 'May' })).not.toBeDisabled();
  });

  it('accessible name contains the visible label text (WCAG 2.5.3)', () => {
    render(<DatePicker {...props} onSeekToYear={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: /go to a date/i });
    expect(trigger.getAttribute('aria-label')).toContain(trigger.textContent);
  });

  it('announces the destination after Go', async () => {
    vi.useFakeTimers();
    try {
      render(<DatePicker {...props} onSeekToYear={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: /go to a date/i }));
      fireEvent.click(screen.getByRole('button', { name: 'Go' }));
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(screen.getByRole('status')).toHaveTextContent('Jumped to March 1950');
    } finally {
      vi.useRealTimers();
    }
  });

  it('closes when focus tabs out of the popover', () => {
    render(
      <div>
        <DatePicker {...props} onSeekToYear={vi.fn()} />
        <button>next</button>
      </div>
    );
    fireEvent.click(screen.getByRole('button', { name: /go to a date/i }));
    fireEvent.blur(screen.getByRole('button', { name: 'Go' }), {
      relatedTarget: screen.getByRole('button', { name: 'next' }),
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
