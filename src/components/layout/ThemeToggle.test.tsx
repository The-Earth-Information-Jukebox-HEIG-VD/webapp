import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'jest-axe';
import '../../i18n';
import { ThemeProvider } from '../../contexts/ThemeContext';
import { ThemeToggle } from './ThemeToggle';
import { mockColorScheme } from '../../test/mockMatchMedia';

let media: ReturnType<typeof mockColorScheme>;

function setup(dark: boolean) {
  media = mockColorScheme(dark);
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>
  );
}

afterEach(() => {
  media?.restore();
  document.documentElement.removeAttribute('data-theme');
});

describe('ThemeToggle', () => {
  it('is a labelled toggle button reflecting the dark theme', () => {
    setup(true);
    const button = screen.getByRole('button', { name: /dark mode/i });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('is not pressed in the light theme', () => {
    setup(false);
    expect(screen.getByRole('button', { name: /dark mode/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('is a native button, focusable, that switches on activation and announces politely', () => {
    setup(true);
    const button = screen.getByRole('button', { name: /dark mode/i });
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('type', 'button');
    button.focus();
    expect(button).toHaveFocus();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    // Enter and Space on a native button dispatch a click (jsdom does not synthesise it)
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(screen.getByRole('status')).toHaveTextContent(/light theme on/i);
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(screen.getByRole('status')).toHaveTextContent(/dark theme on/i);
  });

  it.each([true, false])('has no axe violations (dark system: %s)', async (dark) => {
    const { container } = setup(dark);
    expect(await axe(container)).toHaveNoViolations();
  });
});
