import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'jest-axe';
import '../../i18n';
import { StyleSelector } from './StyleSelector';
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
