import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from './locales/en/translation.json'
import fr from './locales/fr/translation.json'

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    fr: { translation: fr },
  },
  lng: 'fr',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export default i18n
