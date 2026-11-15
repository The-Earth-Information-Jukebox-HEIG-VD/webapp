import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { axe } from 'jest-axe';
import '../../i18n';
import i18n from '../../i18n';
import { KeyMomentsSection } from './KeyMomentsSection';
import { createPositionStore } from '../../hooks/usePlaybackPosition';
import { periodToYear } from '../../services/sonificationApi';
import { keyMoments } from '../../data/keyMoments';

function setup(selectedZone: string | null, position: number | null = null) {
  const onJump = vi.fn();
  const utils = render(
    <KeyMomentsSection
      startYear={1880}
      endYear={2025}
      selectedZone={selectedZone}
      positionStore={createPositionStore(position)}
      onJumpToMoment={onJump}
    />
  );
  return { onJump, ...utils };
}

describe('KeyMomentsSection', () => {
  it('lists every event when no zone is selected, with the zone in the button label', async () => {
    await i18n.changeLanguage('en');
    setup(null);
    expect(screen.getAllByRole('listitem')).toHaveLength(keyMoments.length);
    expect(
      screen.getByRole('button', { name: /Pakistan floods: select Pakistan and play Jul\s–\sSep 2022/ })
    ).toBeInTheDocument();
  });

  it('lists only the events of the selected zone', () => {
    setup('spain');
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(within(items[0]).getByRole('heading', { name: 'Storm Filomena, Madrid' })).toBeInTheDocument();
    expect(within(items[0]).getByRole('img')).toHaveAttribute(
      'alt',
      expect.stringContaining('Madrid')
    );
  });

  it('shows a message when the zone has no event', () => {
    setup('switzerland');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.getByText(/No key event recorded/)).toBeInTheDocument();
  });

  it('calls back with the moment on click', () => {
    const { onJump } = setup('libya');
    fireEvent.click(screen.getByRole('button', { name: /Storm Daniel/ }));
    expect(onJump).toHaveBeenCalledWith(expect.objectContaining({ id: 'storm-daniel-2023', start: '2023-08' }));
  });

  it('marks the event being played', () => {
    setup('pakistan', periodToYear('2022-08'));
    expect(screen.getByText('Playing now')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = setup(null);
    expect(await axe(container)).toHaveNoViolations();
  });
});
