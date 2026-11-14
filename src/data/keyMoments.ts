import type { KeyMoment } from '../types/keyMoments';

/**
 * Key climate moments throughout history
 *
 * These are significant events in climate history that users can
 * jump to directly in the sonification timeline.
 */
export const keyMoments: KeyMoment[] = [
  {
    id: 'industrial-revolution',
    year: 1880,
    titleKey: 'moments.industrialRevolution.title',
    descriptionKey: 'moments.industrialRevolution.description',
    category: 'milestone',
    significance: 'high',
  },
  {
    id: 'dust-bowl',
    year: 1934,
    titleKey: 'moments.dustBowl.title',
    descriptionKey: 'moments.dustBowl.description',
    category: 'extreme',
    significance: 'medium',
  },
  {
    id: 'first-co2-measurements',
    year: 1958,
    titleKey: 'moments.keelingCurve.title',
    descriptionKey: 'moments.keelingCurve.description',
    category: 'milestone',
    significance: 'high',
  },
  {
    id: 'first-earth-day',
    year: 1970,
    titleKey: 'moments.earthDay.title',
    descriptionKey: 'moments.earthDay.description',
    category: 'milestone',
    significance: 'medium',
  },
  {
    id: 'ozone-protocol',
    year: 1987,
    titleKey: 'moments.montrealProtocol.title',
    descriptionKey: 'moments.montrealProtocol.description',
    category: 'agreement',
    significance: 'high',
  },
  {
    id: 'warmest-20th-century',
    year: 1998,
    titleKey: 'moments.warmest1998.title',
    descriptionKey: 'moments.warmest1998.description',
    category: 'warming',
    significance: 'high',
  },
  {
    id: 'kyoto-protocol',
    year: 2005,
    titleKey: 'moments.kyotoProtocol.title',
    descriptionKey: 'moments.kyotoProtocol.description',
    category: 'agreement',
    significance: 'high',
  },
  {
    id: 'arctic-ice-low',
    year: 2012,
    titleKey: 'moments.arcticIce2012.title',
    descriptionKey: 'moments.arcticIce2012.description',
    category: 'extreme',
    significance: 'high',
  },
  {
    id: 'paris-agreement',
    year: 2015,
    titleKey: 'moments.parisAgreement.title',
    descriptionKey: 'moments.parisAgreement.description',
    category: 'agreement',
    significance: 'high',
  },
  {
    id: 'warmest-on-record',
    year: 2023,
    titleKey: 'moments.warmest2023.title',
    descriptionKey: 'moments.warmest2023.description',
    category: 'warming',
    significance: 'high',
  },
];

/**
 * Get key moments within a year range
 */
export function getMomentsInRange(startYear: number, endYear: number): KeyMoment[] {
  return keyMoments.filter((m) => m.year >= startYear && m.year <= endYear);
}

/**
 * Get a moment by ID
 */
export function getMomentById(id: string): KeyMoment | undefined {
  return keyMoments.find((m) => m.id === id);
}

export default keyMoments;
