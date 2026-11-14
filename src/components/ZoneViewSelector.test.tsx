import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '../i18n';
import { ZoneViewSelector } from './controls';
import type { ZoneViewType } from '../types/zones';

function Harness() {
  const [view, setView] = useState<ZoneViewType>('continent');
  return <ZoneViewSelector value={view} onChange={setView} />;
}

describe('ZoneViewSelector accessibility', () => {
  it('is a labelled group with three pressed-state buttons', () => {
    render(<Harness />);
    expect(screen.getByRole('group', { name: /zone selection/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Continents' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Oceans & seas' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('switches among the three views', () => {
    render(<Harness />);
    const continents = screen.getByRole('button', { name: 'Continents' });
    const countries = screen.getByRole('button', { name: 'Countries' });
    const water = screen.getByRole('button', { name: 'Oceans & seas' });

    fireEvent.click(water);
    expect(water).toHaveAttribute('aria-pressed', 'true');
    expect(continents).toHaveAttribute('aria-pressed', 'false');
    expect(countries).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(countries);
    expect(countries).toHaveAttribute('aria-pressed', 'true');
    expect(water).toHaveAttribute('aria-pressed', 'false');

    // Clicking the active option keeps it active (no flip-flop)
    fireEvent.click(countries);
    expect(countries).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(continents);
    expect(continents).toHaveAttribute('aria-pressed', 'true');
  });
});
