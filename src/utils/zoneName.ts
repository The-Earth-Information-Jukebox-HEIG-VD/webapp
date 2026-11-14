import type { TFunction } from 'i18next';
import { findZoneFeature } from '../data/zones';

/**
 * Human-readable, translated name for a zone id (continent, country, ocean or
 * sea). Falls back to the raw id only when the zone is unknown.
 */
export function getZoneDisplayName(zoneId: string, t: TFunction): string {
  const feature = findZoneFeature(zoneId);
  return feature ? (t(feature.properties.nameKey) as string) : zoneId;
}
