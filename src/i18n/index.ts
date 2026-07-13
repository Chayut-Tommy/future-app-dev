import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import en from './locales/en.json';
import th from './locales/th.json';

export type SupportedLanguage = 'en' | 'th';

const resources = {
  en: { translation: en },
  th: { translation: th },
};

/** Only English and Thai are supported so far — anything else (or nothing
 * detected) falls back to English, never a blank/undefined locale. */
export function resolveDeviceLanguage(): SupportedLanguage {
  const code = Localization.getLocales()[0]?.languageCode;
  return code === 'th' ? 'th' : 'en';
}

i18n.use(initReactI18next).init({
  resources,
  lng: resolveDeviceLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
