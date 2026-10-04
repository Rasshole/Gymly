import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {readDeviceLanguagePreferences} from './deviceLanguagePreferences';
import {resolveStartupLanguage} from './resolveDeviceLanguage';
import {
  getTranslations,
  getFallbackTranslations,
  preloadTranslationModule,
} from './translations';
import {createPluralTranslator, createTranslator} from './translate';
import type {PluralTranslateFn, TranslateFn} from './translate';
import {getDateFnsLocale, getIntlLocale} from './locales';
import {setRuntimeLanguage} from './runtimeLanguage';
import {applyLayoutDirectionForLanguage} from './rtl';
import {LOCALE_BY_ID} from './localeRegistry';
import {
  FALLBACK_LANGUAGE,
  LANGUAGE_NATIVE_LABELS,
  coerceToSelectableLanguage,
} from './types';
import type {AppLanguage} from './types';
import {loadStoredLanguage, persistLanguage} from './storage';
import {startupMark} from './startupMark';

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

// Ensure English is available before any provider render (sync, one pack).
try {
  preloadTranslationModule(FALLBACK_LANGUAGE);
  setRuntimeLanguage(FALLBACK_LANGUAGE);
} catch {
  /* pack load failure surfaces via translators falling back */
}

export function LanguageProvider({children}: {children: React.ReactNode}) {
  if (!(globalThis as {__gymlyLpRenderMarked?: boolean}).__gymlyLpRenderMarked) {
    (globalThis as {__gymlyLpRenderMarked?: boolean}).__gymlyLpRenderMarked =
      true;
    startupMark('LanguageProvider render');
  }

  /**
   * CRITICAL: never gate the whole tree on AsyncStorage.
   * Returning `null` until hydrate left the native LaunchScreen up forever when
   * storage hung or preload threw. Boot with English, then swap to persisted/device.
   */
  const [language, setLanguageState] = useState<AppLanguage>(FALLBACK_LANGUAGE);
  const [hasUserChosenLanguage, setHasUserChosenLanguage] = useState(false);
  const [isReady, setIsReady] = useState(true);

  useEffect(() => {
    let cancelled = false;
    startupMark('LanguageProvider hydrate START');
    void (async () => {
      try {
        startupMark('AsyncStorage language read START');
        const stored = await loadStoredLanguage();
        startupMark('AsyncStorage language read END', {
          stored: stored ?? null,
        });
        if (cancelled) {
          return;
        }
        const active = resolveStartupLanguage(
          stored,
          readDeviceLanguagePreferences(),
        );
        startupMark(stored ? 'hydrate apply stored' : 'hydrate apply device', {
          active,
        });
        try {
          preloadTranslationModule(active);
        } catch (e) {
          startupMark('preload language FAILED', {
            err: e instanceof Error ? e.message : String(e),
          });
        }
        setLanguageState(active);
        setRuntimeLanguage(active);
        applyLayoutDirectionForLanguage(active);
        setHasUserChosenLanguage(stored != null);
      } catch (e) {
        startupMark('LanguageProvider hydrate FAILED → keep English', {
          err: e instanceof Error ? e.message : String(e),
        });
        if (!cancelled) {
          setLanguageState(FALLBACK_LANGUAGE);
          setRuntimeLanguage(FALLBACK_LANGUAGE);
          setHasUserChosenLanguage(false);
        }
      } finally {
        if (!cancelled) {
          setIsReady(true);
          startupMark('LanguageProvider hydrate END');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setLanguage = useCallback(
    async (lang: AppLanguage, options?: {persist?: boolean}) => {
      const active = coerceToSelectableLanguage(lang);
      try {
        preloadTranslationModule(active);
      } catch {
        /* keep prior pack; translator falls back to EN */
      }
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
