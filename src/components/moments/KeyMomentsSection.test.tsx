import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { axe } from 'jest-axe';
import '../../i18n';
import i18n from '../../i18n';
import { KeyMomentsSection } from './KeyMomentsSection';
import { createPositionStore } from '../../hooks/usePlaybackPosition';
import { periodToYear } from '../../services/sonificationApi';
import { keyMoments } from '../../data/keyMoments';

/** The event cards: direct items of the events list (each card also lists its datasets) */
function cards(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.moments-grid > li'));
}

function setup(selectedZone: string | null, position: number | null = null, monthFilter: number | null = null) {
  const onJump = vi.fn();
  const utils = render(
    <KeyMomentsSection
      startYear={1880}
      endYear={2025}
      selectedZone={selectedZone}
      positionStore={createPositionStore(position)}
      onJumpToMoment={onJump}
      monthFilter={monthFilter}
    />
  );
  return { onJump, ...utils };
}

describe('KeyMomentsSection', () => {
  it('lists every event when no zone is selected, with the zone in the button label', async () => {
    await i18n.changeLanguage('en');
    setup(null);
    expect(cards()).toHaveLength(keyMoments.length);
    expect(
      screen.getByRole('button', { name: /Pakistan floods: select Pakistan and play Jul\s–\sSep 2022/ })
    ).toBeInTheDocument();
  });

  it('lists only the events of the selected zone', () => {
    setup('spain');
    const items = cards();
    expect(items).toHaveLength(1);
    expect(within(items[0]).getByRole('heading', { name: 'Storm Filomena, Madrid' })).toBeInTheDocument();
    expect(within(items[0]).getByRole('img')).toHaveAttribute(
      'alt',
      expect.stringContaining('Madrid')
    );
  });

  it('lists the events of the countries of a selected continent, naming their country', async () => {
    await i18n.changeLanguage('en');
    const { onJump } = setup('asia');
    expect(cards()).toHaveLength(5);
    const button = screen.getByRole('button', { name: /Pakistan floods: select Pakistan and play Jul\s–\sSep 2022/ });
    expect(screen.getByText('United Arab Emirates, Oman')).toBeInTheDocument();
    fireEvent.click(button);
    expect(onJump).toHaveBeenCalledWith(expect.objectContaining({ id: 'pakistan-floods-2022' }));
  });

  it('lists every dataset of the event and credits its photo with a link', async () => {
    await i18n.changeLanguage('en');
    setup('australia');
    const [card] = cards();
    const datasets = within(card).getByRole('list', { name: 'Datasets that show it' });
    expect(within(datasets).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Fires',
      'Carbon monoxide',
      'Vegetation (NDVI)',
    ]);
    const credit = within(card).getByRole('link', { name: /Cazz · public domain/ });
    expect(credit).toHaveAttribute('href', 'https://commons.wikimedia.org/?curid=94183729');
    expect(credit).toHaveAttribute('target', '_blank');
    expect(credit).toHaveAccessibleName(/opens in a new tab/);
  });

  it('shows the NASA ARCSIX photo for the 2025 Arctic winter ice', () => {
    setup('arcticOcean');
    const card = cards().find((c) => within(c).queryByRole('heading', { name: 'Arctic winter ice record low' }))!;
    expect(within(card).getByRole('img')).toHaveAccessibleName(/sea ice ending in open dark water/);
    const credit = within(card).getByRole('link', { name: /Gary Banziger \/ NASA Langley · public domain/ });
    expect(credit).toHaveAttribute('href', 'https://commons.wikimedia.org/?curid=179332082');
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
    const [card] = cards();
    expect(card).toHaveClass('active');
    expect(card).toHaveAttribute('aria-current', 'true');
  });

  it('uses the month shown in month travel, not the raw playhead', () => {
    // Month travel "August": mid-way through the 2022 bar the playhead is past
    // the window in raw terms, but it still stands for August 2022
    setup('pakistan', periodToYear('2022-08') + 0.4, 8);
    expect(screen.getByText('Playing now')).toBeInTheDocument();
  });

  it('does not mark an event when no zone is selected', () => {
    setup(null, periodToYear('2022-08'));
    expect(screen.queryByText('Playing now')).not.toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = setup(null);
    expect(await axe(container)).toHaveNoViolations();
  });
});
