export type AppLanguage = 'da' | 'en' | 'sv';

export const LANGUAGE_STORAGE_KEY = 'gymly_language';

export const SUPPORTED_LANGUAGES: AppLanguage[] = ['da', 'en', 'sv'];

/** Languages shown on first-launch onboarding (da + en only). */
export const ONBOARDING_LANGUAGES: AppLanguage[] = ['da', 'en'];

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
