import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { axe } from 'jest-axe';
import i18n from '../../i18n';
import { AboutPage, DOCS_URL } from './AboutPage';

describe('AboutPage accessibility', () => {
  // jsdom has no scrolling
  beforeAll(() => {
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  });

  it('names the project EarthChestra and has no axe violations', async () => {
    await i18n.changeLanguage('en');
    const { container } = render(<AboutPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'About EarthChestra' })).toHaveFocus();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('links the full technical documentation, announced as opening a new tab', async () => {
    await i18n.changeLanguage('en');
    render(<AboutPage />);
    const docs = screen.getByRole('link', { name: /read the full technical documentation \(opens in a new tab\)/i });
    expect(docs).toHaveAttribute('href', `${DOCS_URL}development/overview/`);
    expect(docs).toHaveAttribute('target', '_blank');
    expect(docs).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('lists the data sources actually used (and not NASA POWER)', async () => {
    await i18n.changeLanguage('en');
    render(<AboutPage />);
    const sources = within(screen.getByRole('region', { name: 'Data sources' }));
    for (const name of [/GISTEMP/, /GPM IMERG/, /ISS LIS/, /MODIS/, /Earth at Night/, /Natural Earth/]) {
      expect(sources.getByRole('link', { name })).toBeInTheDocument();
    }
    expect(screen.queryByText(/POWER/)).not.toBeInTheDocument();
    expect(screen.queryByText(/press \?/i)).not.toBeInTheDocument();
    // Not stated anywhere in the backend or the data processing: must not be claimed
    expect(screen.queryByText(/1951/)).not.toBeInTheDocument();
  });

  it('names the instruments the backend plays (sonification v0.2.0)', async () => {
    await i18n.changeLanguage('en');
    render(<AboutPage />);
    const orchestra = within(screen.getByRole('region', { name: /orchestra/i }));
    for (const text of [/Lightning: timpani/, /Fires: trombones/, /Night lights: synth pad/]) {
      expect(orchestra.getByText(text)).toBeInTheDocument();
    }
    expect(screen.queryByText(/xylophone|harp/i)).not.toBeInTheDocument();
  });

  it.each(['fr', 'de'])('is translated in %s, keeping the EarthChestra name', async (lang) => {
    await i18n.changeLanguage(lang);
    const { container } = render(<AboutPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('EarthChestra');
    // Screen readers switch pronunciation (WCAG 3.1.1)
    expect(document.documentElement.lang).toBe(lang);
    expect(await axe(container)).toHaveNoViolations();
    expect(screen.queryByText(/about\./)).not.toBeInTheDocument(); // no missing keys
    await i18n.changeLanguage('en');
  });
});
