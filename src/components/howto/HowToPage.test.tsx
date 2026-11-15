import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, screen, within, act, cleanup, renderHook } from '@testing-library/react';
import { axe } from 'jest-axe';
import i18n from '../../i18n';
import { HowToPage } from './HowToPage';
import { Navigation } from '../layout/Navigation';
import { useHashRoute } from '../../hooks/useHashRoute';

describe('HowToPage', () => {
  // jsdom has no scrolling
  beforeAll(() => {
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  });

  afterEach(async () => {
    // Unmount before switching the language back, or the page re-renders outside act()
    cleanup();
    window.location.hash = '';
    await i18n.changeLanguage('en');
  });

  it('focuses its heading and has no axe violations', async () => {
    await i18n.changeLanguage('en');
    const { container } = render(<HowToPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'How to use EarthChestra' })).toHaveFocus();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('walks through the quick start in four ordered steps', async () => {
    await i18n.changeLanguage('en');
    render(<HowToPage />);
    const quick = within(screen.getByRole('region', { name: 'Quick start' }));
    const steps = quick.getAllByRole('listitem');
    expect(steps).toHaveLength(4);
    expect(steps.map((s) => within(s).getByRole('heading', { level: 3 }).textContent)).toEqual([
      'Pick a zone',
      'Choose your sounds',
      'Press Play',
      'Watch the globe',
    ]);
  });

  it('covers every feature: graph, month travel, key events, vinyl travel modes, music style', async () => {
    await i18n.changeLanguage('en');
    render(<HowToPage />);
    for (const name of ['Graph', 'Months', 'Key events', 'Date button', 'Time travel', 'Vinyl', 'Music style']) {
      expect(screen.getByRole('heading', { level: 3, name })).toBeInTheDocument();
    }
    const modes = within(screen.getByRole('region', { name: 'Two ways to listen' }));
    for (const term of ['Space', 'Time', 'Both']) expect(modes.getByText(term, { selector: 'dt' })).toBeInTheDocument();
  });

  it('says the tempo follows the temperature only when the Temperature track is on (orchestra.py compose)', async () => {
    await i18n.changeLanguage('en');
    render(<HowToPage />);
    const tempo = screen.getByRole('heading', { level: 3, name: 'Faster = warmer' }).parentElement!;
    expect(tempo).toHaveTextContent(/only with temperature on/i);
    expect(tempo).toHaveTextContent(/tempo stays steady/i);
  });

  it('lists the real shortcuts (and no ? shortcut), naming the arrows for screen readers', async () => {
    await i18n.changeLanguage('en');
    render(<HowToPage />);
    const keys = within(screen.getByRole('region', { name: 'Keyboard shortcuts' }));
    for (const k of ['Space', 'M', 'Esc', 'Home', 'End', 'Page Up']) expect(keys.getByText(k, { selector: 'kbd' })).toBeInTheDocument();
    expect(keys.getAllByText('Left arrow').length).toBeGreaterThan(0);
    expect(keys.queryByText('?')).not.toBeInTheDocument();
  });

  it('links back to the globe and to About', async () => {
    await i18n.changeLanguage('en');
    render(<HowToPage />);
    expect(screen.getByRole('link', { name: 'Start listening' })).toHaveAttribute('href', '#home');
    expect(screen.getByRole('link', { name: /read about/i })).toHaveAttribute('href', '#about');
  });

  it('explains key events: three steps and what a card says', async () => {
    await i18n.changeLanguage('en');
    const { container } = render(<HowToPage />);
    const events = within(screen.getByRole('region', { name: 'Key events' }));
    const steps = events.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(steps.slice(0, 3)).toEqual(['Find an event', 'Press Play on a card', 'Listen to the change']);
    // Card terms use the same words as the real cards (moments.*)
    for (const term of ['Dataset', 'Zone', 'In our data', 'When it happened']) {
      expect(events.getByText(term, { selector: 'dt' })).toBeInTheDocument();
    }
    // No list of the events: the cards under the globe are the list
    expect(events.queryByText('Hurricane Harvey, Texas')).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\bevents\.[a-z]/);
  });

  it.each(['fr', 'de'])('is fully translated in %s', async (lang) => {
    await i18n.changeLanguage(lang);
    const { container } = render(<HowToPage />);
    expect(document.documentElement.lang).toBe(lang);
    // A missing key would render its path, e.g. "quick.zone.title"
    expect(container.textContent).not.toMatch(/\b(quick|read|explore|events|modes|custom|keys|vinyl)\.[a-z]/);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('How to use route', () => {
  afterEach(() => {
    window.location.hash = '';
  });

  it('maps #how-to-use to the howto route', () => {
    const { result } = renderHook(() => useHashRoute());
    expect(result.current).toBe('home');
    act(() => {
      window.location.hash = '#how-to-use';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(result.current).toBe('howto');
  });

  it('is in the main navigation, between Home and About, marked current on its page', async () => {
    await i18n.changeLanguage('en');
    window.location.hash = '#how-to-use';
    render(<Navigation />);
    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Home', 'How to use', 'About']);
    expect(screen.getByRole('link', { name: 'How to use' })).toHaveAttribute('aria-current', 'page');
  });
});
