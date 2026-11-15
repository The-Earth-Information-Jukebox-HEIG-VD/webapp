import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { HemisphereLabels } from '../../utils/vinylGeometry';

/** Localised N/S/E/W letters for formatLatLng (e.g. "O" for west in French). */
export function useHemisphereLabels(): HemisphereLabels {
  const { t, i18n } = useTranslation();
  return useMemo(
    () => ({ n: t('vinyl.hemi.n'), s: t('vinyl.hemi.s'), e: t('vinyl.hemi.e'), w: t('vinyl.hemi.w') }),
    // t changes identity with the language
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, i18n.language]
  );
}
