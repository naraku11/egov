import { createContext, useContext, useState } from 'react';
import { translations } from '../i18n/translations.js';

const LanguageContext = createContext(null);

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState(() => localStorage.getItem('egov_lang') || 'en');

  const t = (key) => translations[language]?.[key] || translations.en[key] || key;

  const changeLanguage = (lang) => {
    setLanguage(lang);
    localStorage.setItem('egov_lang', lang);
  };

  return (
    <LanguageContext.Provider value={{ language, changeLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
};
