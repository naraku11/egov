/**
 * contexts/LanguageContext.jsx
 *
 * Provides internationalisation (i18n) support to the entire component tree.
 *
 * Features:
 *   - Persists the user's language preference in localStorage under the key
 *     "egov_lang" so the selection survives page refreshes.
 *   - Defaults to English ("en") when no preference has been stored.
 *   - Exposes a translation helper `t(key)` that resolves a translation string
 *     from the active language, falling back to English, then to the raw key
 *     itself if no translation exists — this prevents blank UI text during
 *     incomplete translation coverage.
 *
 * Exports:
 *   LanguageProvider – context provider component.
 *   useLanguage      – hook that returns { language, changeLanguage, t }.
 */

import { createContext, useContext, useState } from 'react';
import { translations } from '../i18n/translations.js'; // all locale string maps

/** @type {React.Context<LanguageContextValue|null>} */
const LanguageContext = createContext(null);

/**
 * Wraps child components with language state and the translation helper.
 *
 * @param {{ children: React.ReactNode }} props
 * @returns {React.ReactElement}
 */
export const LanguageProvider = ({ children }) => {
  /**
   * Active locale code (e.g. "en", "tl").
   * Initialised lazily from localStorage so the stored preference is read
   * only once on first render rather than on every re-render.
   */
  const [language, setLanguage] = useState(
    () => localStorage.getItem('egov_lang') || 'en'
  );

  /**
   * Looks up a translation string by key for the currently active locale.
   *
   * Resolution order:
   *   1. translations[activeLanguage][key]  — preferred locale
   *   2. translations.en[key]               — English fallback
   *   3. key itself                         — last-resort raw key
   *
   * @param {string} key - The translation key (e.g. "nav.dashboard").
   * @returns {string}   The translated string, or the key if no match found.
   */
  const t = (key) => translations[language]?.[key] || translations.en[key] || key;

  /**
   * Changes the active locale and persists the choice to localStorage.
   *
   * @param {string} lang - BCP-47 language code (e.g. "en", "tl").
   */
  const changeLanguage = (lang) => {
    setLanguage(lang);
    localStorage.setItem('egov_lang', lang); // persist across sessions
  };

  return (
    <LanguageContext.Provider value={{ language, changeLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

/**
 * Hook to consume the LanguageContext.
 *
 * @returns {{ language: string, changeLanguage: (lang: string) => void, t: (key: string) => string }}
 * @throws {Error} If called outside of a <LanguageProvider> tree.
 */
export const useLanguage = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
};
