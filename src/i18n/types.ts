import {getReadyLocaleIds, isReadyLocale} from './localeRegistry';

export type AppLanguage = 'da' | 'en' | 'sv' | 'nb';

export const LANGUAGE_STORAGE_KEY = 'gymly_language';

/** Locales that have a translation module registered in translations/index. */
export const SUPPORTED_LANGUAGES: AppLanguage[] = ['da', 'en', 'sv', 'nb'];

/**
 * Languages shown in onboarding + settings.
 * Derived from locale registry `ready` status ∩ supported modules.
 */
export const SELECTABLE_LANGUAGES = getReadyLocaleIds().filter(id =>
  (SUPPORTED_LANGUAGES as string[]).includes(id),
) as AppLanguage[];

export type SelectableLanguage = (typeof SELECTABLE_LANGUAGES)[number];

/** @deprecated Use SELECTABLE_LANGUAGES */
export const ONBOARDING_LANGUAGES: AppLanguage[] = [...SELECTABLE_LANGUAGES];

/** Native language names (shown in picker in all locales). */
export const LANGUAGE_NATIVE_LABELS: Record<AppLanguage, string> = {
  da: 'Dansk',
  en: 'English',
  sv: 'Svenska',
  nb: 'Norsk',
};

/** Master fallback locale for missing keys. */
export const FALLBACK_LANGUAGE: AppLanguage = 'en';

/**
 * Normalize device/storage language tags to an AppLanguage id.
 * - nb / nb-NO → nb
 * - no / no-NO → nb (Bokmål; Nynorsk is separate)
 * - nn / nn-NO → null (unsupported)
 */
export function normalizeLanguageTag(lang: string | null | undefined): string | null {
  if (!lang) {
    return null;
  }
  const raw = lang.trim().toLowerCase().replace(/_/g, '-');
  const primary = raw.split('-')[0] ?? raw;
  if (primary === 'nb' || raw.startsWith('nb-')) {
    return 'nb';
  }
  if (primary === 'no' || raw.startsWith('no-')) {
    // Macro-language "no" → Bokmål for Gymly (explicit product decision).
    return 'nb';
  }
  if (primary === 'nn' || raw.startsWith('nn-')) {
    return null;
  }
  return primary;
}

/** Map any stored/device code to a selectable (ready) UI language. */
export function coerceToSelectableLanguage(lang: string | null | undefined): SelectableLanguage {
  const normalized = normalizeLanguageTag(lang) ?? lang;
  if (
    normalized &&
    isReadyLocale(normalized) &&
    (SELECTABLE_LANGUAGES as string[]).includes(normalized)
  ) {
    return normalized as SelectableLanguage;
  }
  return 'en';
}

/** Recursive string tree for translations. */
export type TranslationDict = {
  readonly [key: string]: string | TranslationDict;
};
