import {
  getReadyLocaleIds,
  isReadyLocale,
  LOCALE_BY_ID,
} from './localeRegistry';

/**
 * Installed translation module ids.
 * Adding a language: add `translations/{id}.ts`, register in translations/index,
 * append id here, then set registry status to `ready` after the coverage gate passes.
 */
export const LANGUAGE_MODULE_IDS = [
  'da',
  'en',
  'sv',
  'nb',
  'de',
  'fr',
  'es',
  'nl',
  'it',
  'pl',
  'pt',
  'ko',
  'ro',
  'ja',
  'zh-Hans',
  'zh-Hant',
  'tr',
  'cs',
  'el',
  'hu',
  'vi',
  'fi',
  'uk',
  'id',
  'th',
  'ar',
  'he',
  'hi',
  'ms',
] as const;

export type AppLanguage = (typeof LANGUAGE_MODULE_IDS)[number];

export const LANGUAGE_STORAGE_KEY = 'gymly_language';

/** Locales that have a translation module on disk. */
export const SUPPORTED_LANGUAGES: readonly AppLanguage[] = LANGUAGE_MODULE_IDS;

export function hasTranslationModule(id: string): id is AppLanguage {
  return (LANGUAGE_MODULE_IDS as readonly string[]).includes(id);
}

/**
 * Languages shown in onboarding + settings.
 * Derived from locale registry `ready` ∩ installed modules.
 */
export const SELECTABLE_LANGUAGES = getReadyLocaleIds().filter(id =>
  hasTranslationModule(id),
) as AppLanguage[];

export type SelectableLanguage = (typeof SELECTABLE_LANGUAGES)[number];

/** @deprecated Use SELECTABLE_LANGUAGES */
export const ONBOARDING_LANGUAGES: AppLanguage[] = [...SELECTABLE_LANGUAGES];

/**
 * @deprecated Prefer LOCALE_BY_ID[id].nativeName — derived from registry for installed modules.
 */
export const LANGUAGE_NATIVE_LABELS: Record<AppLanguage, string> =
  Object.fromEntries(
    LANGUAGE_MODULE_IDS.map(id => [
      id,
      LOCALE_BY_ID[id]?.nativeName ?? id,
    ]),
  ) as Record<AppLanguage, string>;

/** Master fallback locale for missing keys. */
export const FALLBACK_LANGUAGE: AppLanguage = 'en';

/**
 * Normalize device/storage language tags to a primary language id.
 * - nb / nb-NO → nb
 * - no / no-NO → nb (Bokmål; Nynorsk is separate)
 * - nn / nn-NO → null (unsupported)
 * - zh-Hans / zh-CN → zh-Hans when that form is used
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
  if (raw === 'zh-hans' || raw.startsWith('zh-cn') || raw === 'zh-cn') {
    return 'zh-Hans';
  }
  if (raw === 'zh-hant' || raw.startsWith('zh-tw') || raw.startsWith('zh-hk')) {
    return 'zh-Hant';
  }
  // Brazilian Portuguese → European PT pack until pt-BR is ready
  if (raw === 'pt-br' || raw.startsWith('pt-br')) {
    return isReadyLocale('pt-BR') ? 'pt-BR' : 'pt';
  }
  // Prefer full registry id when device sends a matching tag (e.g. pt-br)
  if (LOCALE_BY_ID[raw]) {
    return LOCALE_BY_ID[raw].id;
  }
  const byIntl = Object.values(LOCALE_BY_ID).find(
    l => l.intlLocale.toLowerCase() === raw || l.intlLocale.toLowerCase().startsWith(raw),
  );
  if (byIntl) {
    return byIntl.id;
  }
  return primary;
}

/** Map any stored/device code to a selectable (ready + module) UI language. */
export function coerceToSelectableLanguage(
  lang: string | null | undefined,
): SelectableLanguage {
  const normalized = normalizeLanguageTag(lang) ?? lang;
  if (
    normalized &&
    isReadyLocale(normalized) &&
    hasTranslationModule(normalized) &&
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
