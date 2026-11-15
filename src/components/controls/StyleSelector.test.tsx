import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { axe } from 'jest-axe';
import '../../i18n';
import { StyleSelector, groupGenres } from './StyleSelector';
import { usePlayerShortcuts } from '../../hooks/usePlayerShortcuts';
import type { Genre } from '../../services/sonificationApi';

const genres: Genre[] = [
  { id: 'orchestra', name: 'Orchestra', bpm: 90, description: 'A classical ensemble.' },
  { id: 'funk', name: 'Funk', bpm: 105, description: 'Groovy bass and horns.' },
];

describe('StyleSelector accessibility', () => {
  it('is a labelled select with the description as hint, and has no axe violations', async () => {
    const { container } = render(<StyleSelector genres={genres} value="orchestra" onChange={() => {}} />);
    const select = screen.getByRole('combobox', { name: 'Music style' });
    expect(select).toHaveValue('orchestra');
    expect(select).toHaveAccessibleDescription(/classical ensemble/i);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders nothing while the styles are unknown', () => {
    const { container } = render(<StyleSelector genres={[]} value={undefined} onChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('reports the choice and announces it politely', () => {
    const onChange = vi.fn();
    const { rerender } = render(<StyleSelector genres={genres} value="orchestra" onChange={onChange} />);
    expect(screen.getByRole('status')).toHaveTextContent('');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'funk' } });
    expect(onChange).toHaveBeenCalledWith('funk');
    rerender(<StyleSelector genres={genres} value="funk" onChange={onChange} />);
    expect(screen.getByRole('status')).toHaveTextContent('Music style: Funk');
  });

  it('does not announce a restored or reloaded style, only the user\'s choice', () => {
    const { rerender } = render(<StyleSelector genres={genres} value="orchestra" onChange={() => {}} />);
    rerender(<StyleSelector genres={genres.map((g) => ({ ...g }))} value="funk" onChange={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('keeps global player shortcuts out of the select', () => {
    const onPlayPause = vi.fn();
    const onPrev = vi.fn();
    function Harness() {
      usePlayerShortcuts({ onPlayPause, onPrev, onNext: vi.fn(), onFirst: vi.fn(), onLast: vi.fn(), onMute: vi.fn() });
      return <StyleSelector genres={genres} value="orchestra" onChange={() => {}} />;
    }
    render(<Harness />);
    const select = screen.getByRole('combobox');
    select.focus();
    fireEvent.keyDown(select, { key: 'ArrowLeft' });
    fireEvent.keyDown(select, { key: ' ' });
    expect(onPrev).not.toHaveBeenCalled();
    expect(onPlayPause).not.toHaveBeenCalled();
  });
});

describe('StyleSelector recommended styles', () => {
  const all: Genre[] = [
    { id: 'orchestra', name: 'Orchestra', bpm: 76, description: 'The orchestra.' },
    { id: 'funk', name: 'Funk & disco', bpm: 112, description: 'Clavinet.' },
    { id: 'trap', name: 'Modern pop & trap', bpm: 140, description: '808 bass.' },
    { id: 'realistic', name: 'Realistic sounds', bpm: 76, description: 'Rain, fire, thunder.' },
  ];

  it('groups orchestra and realistic first, the others just for fun; no axe violations', async () => {
    const { container } = render(<StyleSelector genres={all} value="orchestra" onChange={() => {}} />);
    const [recommended, fun] = screen.getAllByRole('group');
    expect(recommended).toHaveAttribute('label', 'Recommended');
    expect(within(recommended).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Orchestra',
      'Realistic sounds',
    ]);
    expect(fun).toHaveAttribute('label', 'Just for fun');
    expect(within(fun).getAllByRole('option').map((o) => o.textContent)).toEqual(['Funk & disco', 'Modern pop & trap']);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('explains the recommendation in the (i) tooltip, shown on hover, and in the select description', () => {
    render(<StyleSelector genres={all} value="orchestra" onChange={() => {}} />);
    const info = screen.getByRole('button', { name: 'About the music style' });
    const tooltip = screen.getByRole('tooltip', { hidden: true });
    expect(tooltip).toHaveTextContent(/Orchestra and Realistic sounds are the styles we worked on most/);
    expect(tooltip).not.toHaveClass('visible');
    fireEvent.mouseEnter(info.parentElement!);
    expect(tooltip).toHaveClass('visible');
    expect(info).toHaveAccessibleDescription(/worked on most/);
    expect(screen.getByRole('combobox')).toHaveAccessibleDescription(/worked on most.*The orchestra\./);
    expect(screen.queryByText(/just for fun:/i)).toBeNull();
  });

  it('says when a fun style is selected', () => {
    render(<StyleSelector genres={all} value="funk" onChange={() => {}} />);
    expect(screen.getByRole('combobox')).toHaveAccessibleDescription(/This style is just for fun/);
  });

  it('shows a flat list without groups when no recommended style is offered', () => {
    render(<StyleSelector genres={genres.filter((g) => g.id !== 'orchestra')} value="funk" onChange={() => {}} />);
    expect(screen.queryAllByRole('group')).toHaveLength(0);
    expect(screen.queryByText(/worked on most/)).toBeNull();
  });

  it('groupGenres keeps the recommended order whatever the server order', () => {
    const { recommended, fun } = groupGenres([all[3], all[1], all[0]]);
    expect(recommended.map((g) => g.id)).toEqual(['orchestra', 'realistic']);
    expect(fun.map((g) => g.id)).toEqual(['funk']);
  });
});
