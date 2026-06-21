export type AppLanguage = 'da' | 'en' | 'sv';

export const LANGUAGE_STORAGE_KEY = 'gymly_language';

/** Full set including locales kept for future launch (sv files remain). */
export const SUPPORTED_LANGUAGES: AppLanguage[] = ['da', 'en', 'sv'];

/** Languages shown in onboarding + settings picker (pre-launch). */
export const SELECTABLE_LANGUAGES = ['da', 'en'] as const;

export type SelectableLanguage = (typeof SELECTABLE_LANGUAGES)[number];

/** @deprecated Use SELECTABLE_LANGUAGES — same list as onboarding. */
export const ONBOARDING_LANGUAGES: AppLanguage[] = [...SELECTABLE_LANGUAGES];

/** Native language names (shown in picker in all locales). */
export const LANGUAGE_NATIVE_LABELS: Record<AppLanguage, string> = {
  da: 'Dansk',
  en: 'English',
  sv: 'Svenska',
};

/** Recursive string tree for translations. */
export type TranslationDict = {
  readonly [key: string]: string | TranslationDict;
};
