import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enCommon from './locales/en/common.json';
import enPlayer from './locales/en/player.json';
import enHowto from './locales/en/howto.json';
import frCommon from './locales/fr/common.json';
import frPlayer from './locales/fr/player.json';
import frHowto from './locales/fr/howto.json';
import deCommon from './locales/de/common.json';
import dePlayer from './locales/de/player.json';
import deHowto from './locales/de/howto.json';

export const supportedLanguages = ['en', 'fr', 'de'] as const;
export type SupportedLanguage = typeof supportedLanguages[number];

export const languageNames: Record<SupportedLanguage, string> = {
  en: 'English',
  fr: 'Français',
  de: 'Deutsch',
};

const resources = {
  en: {
    common: enCommon,
    player: enPlayer,
    howto: enHowto,
  },
  fr: {
    common: frCommon,
    player: frPlayer,
    howto: frHowto,
  },
  de: {
    common: deCommon,
    player: dePlayer,
    howto: deHowto,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: ['common', 'player', 'howto'],

    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
    },

    interpolation: {
      escapeValue: false, // React already escapes values
    },

    react: {
      useSuspense: true,
    },
  });

// Keep <html lang> in sync so screen readers pronounce French and German
// correctly (WCAG 3.1.1). Also applies the language detected at start-up.
const syncDocumentLang = (lng: string) => {
  if (typeof document !== 'undefined') document.documentElement.lang = lng.split('-')[0];
};
i18n.on('languageChanged', syncDocumentLang);
if (i18n.language) syncDocumentLang(i18n.language);

export default i18n;
