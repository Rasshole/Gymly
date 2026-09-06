import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {resolveDeviceLanguage} from './resolveDeviceLanguage';
import {getTranslations, getFallbackTranslations} from './translations';
import {createPluralTranslator, createTranslator} from './translate';
import type {PluralTranslateFn, TranslateFn} from './translate';
import {getDateFnsLocale, getIntlLocale} from './locales';
import {setRuntimeLanguage} from './runtimeLanguage';
import {applyLayoutDirectionForLanguage} from './rtl';
import {LOCALE_BY_ID} from './localeRegistry';
import {LANGUAGE_NATIVE_LABELS, coerceToSelectableLanguage} from './types';
import type {AppLanguage} from './types';
import {loadStoredLanguage, persistLanguage} from './storage';

type LanguageContextValue = {
  language: AppLanguage;
  /** User has saved a language choice (show Login, not language picker). */
  hasUserChosenLanguage: boolean;
  isReady: boolean;
  t: TranslateFn;
  /** Plural-aware: `tp('friends.count', n)` → friends.count_one / _other via Intl.PluralRules */
  tp: PluralTranslateFn;
  setLanguage: (lang: AppLanguage, options?: {persist?: boolean}) => Promise<void>;
  languageLabel: string;
  dateFnsLocale: ReturnType<typeof getDateFnsLocale>;
  intlLocale: string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({children}: {children: React.ReactNode}) {
  const [language, setLanguageState] = useState<AppLanguage>('en');
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
        const active = coerceToSelectableLanguage(stored);
        setLanguageState(active);
        setRuntimeLanguage(active);
        applyLayoutDirectionForLanguage(active);
        setHasUserChosenLanguage(true);
      } else {
        const device = resolveDeviceLanguage();
        setLanguageState(device);
        setRuntimeLanguage(device);
        applyLayoutDirectionForLanguage(device);
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
      const active = coerceToSelectableLanguage(lang);
      setLanguageState(active);
      setRuntimeLanguage(active);
      applyLayoutDirectionForLanguage(active);
      if (options?.persist !== false) {
        await persistLanguage(active);
        setHasUserChosenLanguage(true);
      }
    },
    [],
  );

  const dict = useMemo(() => getTranslations(language), [language]);
  const fallbackDict = useMemo(() => getFallbackTranslations(), []);
  const intlLocale = useMemo(() => getIntlLocale(language), [language]);
  const t = useMemo(() => createTranslator(dict, fallbackDict), [dict, fallbackDict]);
  const tp = useMemo(
    () => createPluralTranslator(dict, fallbackDict, intlLocale),
    [dict, fallbackDict, intlLocale],
  );

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      hasUserChosenLanguage,
      isReady,
      t,
      tp,
      setLanguage,
      languageLabel:
        LOCALE_BY_ID[language]?.nativeName ?? LANGUAGE_NATIVE_LABELS[language],
      dateFnsLocale: getDateFnsLocale(language),
      intlLocale,
    }),
    [language, hasUserChosenLanguage, isReady, t, tp, setLanguage, intlLocale],
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
