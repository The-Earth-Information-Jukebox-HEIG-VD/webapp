import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enCommon from './locales/en/common.json';
import enPlayer from './locales/en/player.json';
import frCommon from './locales/fr/common.json';
import frPlayer from './locales/fr/player.json';
import deCommon from './locales/de/common.json';
import dePlayer from './locales/de/player.json';

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
  },
  fr: {
    common: frCommon,
    player: frPlayer,
  },
  de: {
    common: deCommon,
    player: dePlayer,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: ['common', 'player'],

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

export default i18n;
