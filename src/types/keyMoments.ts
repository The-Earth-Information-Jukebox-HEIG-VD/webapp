/**
 * Key climate moment definition
 */
export interface KeyMoment {
  id: string;
  year: number;
  titleKey: string;
  descriptionKey: string;
  category: 'warming' | 'extreme' | 'milestone' | 'agreement';
  significance: 'high' | 'medium';
}
