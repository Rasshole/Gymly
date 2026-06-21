import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type {AppLanguage} from './types';
import {LANGUAGE_NATIVE_LABELS} from './types';
import {loadStoredLanguage, persistLanguage} from './storage';
import {resolveDeviceLanguage, toSelectableLanguage} from './resolveDeviceLanguage';
import {getTranslations} from './translations';
import {createTranslator} from './translate';
import {getDateFnsLocale, getIntlLocale} from './locales';
import {setRuntimeLanguage} from './runtimeLanguage';

type LanguageContextValue = {
  language: AppLanguage;
  /** User has saved a language choice (show Login, not language picker). */
  hasUserChosenLanguage: boolean;
  isReady: boolean;
  t: (path: string, params?: Record<string, string | number>) => string;
  setLanguage: (lang: AppLanguage, options?: {persist?: boolean}) => Promise<void>;
  languageLabel: string;
  dateFnsLocale: ReturnType<typeof getDateFnsLocale>;
  intlLocale: string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({children}: {children: React.ReactNode}) {
  const [language, setLanguageState] = useState<AppLanguage>('da');
  const [hasUserChosenLanguage, setHasUserChosenLanguage] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await loadStoredLanguage();
      if (cancelled) {
        return;
      }
      if (stored) {
        const active = toSelectableLanguage(stored);
        setLanguageState(active);
        setRuntimeLanguage(active);
        setHasUserChosenLanguage(true);
      } else {
        const device = resolveDeviceLanguage();
        setLanguageState(device);
        setRuntimeLanguage(device);
        setHasUserChosenLanguage(false);
      }
      setIsReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setLanguage = useCallback(
    async (lang: AppLanguage, options?: {persist?: boolean}) => {
      setLanguageState(lang);
      setRuntimeLanguage(lang);
      if (options?.persist !== false) {
        await persistLanguage(lang);
        setHasUserChosenLanguage(true);
      }
    },
    [],
  );

  const dict = useMemo(() => getTranslations(language), [language]);
  const t = useMemo(() => createTranslator(dict), [dict]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      hasUserChosenLanguage,
      isReady,
      t,
      setLanguage,
      languageLabel: LANGUAGE_NATIVE_LABELS[language],
      dateFnsLocale: getDateFnsLocale(language),
      intlLocale: getIntlLocale(language),
    }),
    [language, hasUserChosenLanguage, isReady, t, setLanguage],
  );

  if (!isReady) {
    return null;
  }

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useTranslation(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useTranslation must be used within LanguageProvider');
  }
  return ctx;
}
