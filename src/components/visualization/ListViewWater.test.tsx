import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '../../i18n';
import { ListView } from './ListView';
import { getFeatureCentroid } from '../../utils/geometry';
import { findZoneFeature } from '../../data/zones';
import type { ZoneFeature } from '../../types/zones';

function renderWater(selectedZone: string | null = null) {
  const onZoneSelect = vi.fn();
  render(
    <ListView selectedZone={selectedZone} onZoneSelect={onZoneSelect} zoneViewType="water" />
  );
  return onZoneSelect;
}

describe('ListView water tree', () => {
  it('renders one group per ocean plus Inland seas, collapsed', () => {
    renderWater();
    const tree = screen.getByRole('tree', { name: 'Seas grouped by ocean' });
    const items = within(tree).getAllByRole('treeitem');
    expect(items).toHaveLength(6);
    expect(screen.getByRole('treeitem', { name: /Pacific Ocean/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('treeitem', { name: /Inland seas/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Caspian Sea')).not.toBeInTheDocument();
  });

  it('expands with ArrowRight and collapses with ArrowLeft', () => {
    renderWater();
    const atlantic = screen.getByRole('treeitem', { name: /Atlantic Ocean/ });
    fireEvent.keyDown(atlantic, { key: 'ArrowRight' });
    expect(atlantic).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Baltic Sea')).toBeInTheDocument();
    fireEvent.keyDown(atlantic, { key: 'ArrowLeft' });
    expect(atlantic).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Baltic Sea')).not.toBeInTheDocument();
  });

  it('selects an ocean with Enter and a sea with Space', () => {
    const onZoneSelect = renderWater();
    const atlantic = screen.getByRole('treeitem', { name: /Atlantic Ocean/ });
    fireEvent.keyDown(atlantic, { key: 'Enter' });
    expect(onZoneSelect).toHaveBeenCalledWith('atlanticOcean', expect.any(Array));
    // Enter selects only; it does not toggle expansion
    expect(atlantic).toHaveAttribute('aria-expanded', 'false');

    fireEvent.keyDown(atlantic, { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('treeitem', { name: 'Baltic Sea' }), { key: ' ' });
    expect(onZoneSelect).toHaveBeenLastCalledWith('balticSea', expect.any(Array));
  });

  it('inland seas group only expands; its sea is selectable', () => {
    const onZoneSelect = renderWater();
    const inland = screen.getByRole('treeitem', { name: /Inland seas/ });
    expect(inland).toHaveAttribute('aria-selected', 'false');
    fireEvent.keyDown(inland, { key: 'Enter' });
    expect(onZoneSelect).not.toHaveBeenCalled();
    expect(inland).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(screen.getByRole('treeitem', { name: 'Caspian Sea' }), { key: 'Enter' });
    expect(onZoneSelect).toHaveBeenCalledWith('caspianSea', expect.any(Array));
  });

  it('marks the selected ocean', () => {
    renderWater('pacificOcean');
    expect(screen.getByRole('treeitem', { name: /Pacific Ocean/ })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('ListView water tree accessibility', () => {
  it('describes how ocean items behave and keeps chevron out of the name', () => {
    renderWater();
    const pacific = screen.getByRole('treeitem', { name: /Pacific Ocean/ });
    const hint = document.getElementById(pacific.getAttribute('aria-describedby')!);
    expect(hint).toHaveTextContent(/Enter to select/);
    expect(pacific.getAttribute('aria-label')).toBeNull();
    expect(screen.queryByRole('button', { name: /expand|collapse/i })).not.toBeInTheDocument();
    expect(pacific).toHaveAttribute('aria-level', '1');
  });

  it('gives seas level 2', () => {
    renderWater();
    fireEvent.keyDown(screen.getByRole('treeitem', { name: /Atlantic Ocean/ }), { key: 'ArrowRight' });
    expect(screen.getByRole('treeitem', { name: 'Baltic Sea' })).toHaveAttribute('aria-level', '2');
  });
});

describe('getFeatureCentroid', () => {
  it('uses properties.center when present', () => {
    const feature: ZoneFeature = {
      type: 'Feature',
      properties: { id: 'x', name: 'x', nameKey: 'x', type: 'ocean', center: [-150, 5] },
      geometry: { type: 'Polygon', coordinates: [[[-180, 0], [180, 0], [180, 10], [-180, 10], [-180, 0]]] },
    };
    expect(getFeatureCentroid(feature)).toEqual({ lng: -150, lat: 5 });
  });

  it('keeps the Pacific away from lng 0', () => {
    const c = getFeatureCentroid(findZoneFeature('pacificOcean')!);
    expect(Math.abs(c.lng)).toBeGreaterThan(90);
  });

  it('falls back to the vertex mean without center', () => {
    const feature: ZoneFeature = {
      type: 'Feature',
      properties: { id: 'y', name: 'y', nameKey: 'y', type: 'country' },
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10]]] },
    };
    expect(getFeatureCentroid(feature)).toEqual({ lng: 5, lat: 5 });
  });
});
