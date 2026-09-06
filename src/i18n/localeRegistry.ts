/**
 * Global locale registry — metadata for the language picker.
 * Only locales with status `ready` and a translation module appear in the UI.
 * Add a translation file + set status to `ready` to ship a new language (no picker code changes).
 */

export type LocaleStatus = 'ready' | 'partial' | 'planned';

export type LocaleDefinition = {
  /** BCP-47 language code used in AsyncStorage / AppLanguage */
  id: string;
  /** Native endonym (Dansk, Deutsch, …) */
  nativeName: string;
  /** English name for search */
  englishName: string;
  /** Flag emoji (or regional indicator) */
  flag: string;
  /** Intl / date-fns locale tag */
  intlLocale: string;
  status: LocaleStatus;
  /** Search aliases (native + english + common spellings) */
  searchTerms: string[];
};

/**
 * Catalog of current + future Gymly locales.
 * `ready` = full da/en-parity translation pack shipped.
 * `partial` = file exists but incomplete (English fallback fills gaps; not shown in picker).
 * `planned` = metadata only; no translation module yet.
 */
export const LOCALE_REGISTRY: LocaleDefinition[] = [
  {
    id: 'da',
    nativeName: 'Dansk',
    englishName: 'Danish',
    flag: '🇩🇰',
    intlLocale: 'da-DK',
    status: 'ready',
    searchTerms: ['dansk', 'danish', 'da', 'dk'],
  },
  {
    id: 'en',
    nativeName: 'English',
    englishName: 'English',
    flag: '🇬🇧',
    intlLocale: 'en-US',
    status: 'ready',
    searchTerms: ['english', 'engelsk', 'en', 'uk', 'us'],
  },
  {
    id: 'sv',
    nativeName: 'Svenska',
    englishName: 'Swedish',
    flag: '🇸🇪',
    intlLocale: 'sv-SE',
    status: 'ready',
    searchTerms: ['svenska', 'swedish', 'sv', 'se'],
  },
  {
    id: 'nb',
    nativeName: 'Norsk',
    englishName: 'Norwegian',
    flag: '🇳🇴',
    intlLocale: 'nb-NO',
    status: 'ready',
    searchTerms: ['norsk', 'norwegian', 'bokmål', 'bokmal', 'nb', 'no'],
  },
  {
    id: 'de',
    nativeName: 'Deutsch',
    englishName: 'German',
    flag: '🇩🇪',
    intlLocale: 'de-DE',
    status: 'planned',
    searchTerms: ['deutsch', 'german', 'tysk', 'de'],
  },
  {
    id: 'fr',
    nativeName: 'Français',
    englishName: 'French',
    flag: '🇫🇷',
    intlLocale: 'fr-FR',
    status: 'planned',
    searchTerms: ['français', 'francais', 'french', 'fransk', 'fr'],
  },
  {
    id: 'es',
    nativeName: 'Español',
    englishName: 'Spanish',
    flag: '🇪🇸',
    intlLocale: 'es-ES',
    status: 'planned',
    searchTerms: ['español', 'espanol', 'spanish', 'spansk', 'es'],
  },
  {
    id: 'it',
    nativeName: 'Italiano',
    englishName: 'Italian',
    flag: '🇮🇹',
    intlLocale: 'it-IT',
    status: 'planned',
    searchTerms: ['italiano', 'italian', 'italiensk', 'it'],
  },
  {
    id: 'nl',
    nativeName: 'Nederlands',
    englishName: 'Dutch',
    flag: '🇳🇱',
    intlLocale: 'nl-NL',
    status: 'planned',
    searchTerms: ['nederlands', 'dutch', 'hollandsk', 'nl'],
  },
  {
    id: 'pt',
    nativeName: 'Português',
    englishName: 'Portuguese',
    flag: '🇵🇹',
    intlLocale: 'pt-PT',
    status: 'planned',
    searchTerms: ['português', 'portugues', 'portuguese', 'portugisisk', 'pt'],
  },
  {
    id: 'pl',
    nativeName: 'Polski',
    englishName: 'Polish',
    flag: '🇵🇱',
    intlLocale: 'pl-PL',
    status: 'planned',
    searchTerms: ['polski', 'polish', 'polsk', 'pl'],
  },
  {
    id: 'fi',
    nativeName: 'Suomi',
    englishName: 'Finnish',
    flag: '🇫🇮',
    intlLocale: 'fi-FI',
    status: 'planned',
    searchTerms: ['suomi', 'finnish', 'finsk', 'fi'],
  },
  // Future (not in initial pack — registry ready for expansion)
  {
    id: 'pt-BR',
    nativeName: 'Português (Brasil)',
    englishName: 'Portuguese (Brazil)',
    flag: '🇧🇷',
    intlLocale: 'pt-BR',
    status: 'planned',
    searchTerms: ['português', 'brazil', 'brasil', 'brazilian', 'pt-br'],
  },
  {
    id: 'tr',
    nativeName: 'Türkçe',
    englishName: 'Turkish',
    flag: '🇹🇷',
    intlLocale: 'tr-TR',
    status: 'planned',
    searchTerms: ['türkçe', 'turkce', 'turkish', 'tyrkisk', 'tr'],
  },
  {
    id: 'ar',
    nativeName: 'العربية',
    englishName: 'Arabic',
    flag: '🇸🇦',
    intlLocale: 'ar-SA',
    status: 'planned',
    searchTerms: ['arabic', 'arabisk', 'العربية', 'ar'],
  },
  {
    id: 'he',
    nativeName: 'עברית',
    englishName: 'Hebrew',
    flag: '🇮🇱',
    intlLocale: 'he-IL',
    status: 'planned',
    searchTerms: ['hebrew', 'hebraisk', 'עברית', 'he'],
  },
  {
    id: 'ja',
    nativeName: '日本語',
    englishName: 'Japanese',
    flag: '🇯🇵',
    intlLocale: 'ja-JP',
    status: 'planned',
    searchTerms: ['japanese', 'japansk', '日本語', 'ja'],
  },
  {
    id: 'ko',
    nativeName: '한국어',
    englishName: 'Korean',
    flag: '🇰🇷',
    intlLocale: 'ko-KR',
    status: 'planned',
    searchTerms: ['korean', 'koreansk', '한국어', 'ko'],
  },
  {
    id: 'zh-Hans',
    nativeName: '简体中文',
    englishName: 'Chinese (Simplified)',
    flag: '🇨🇳',
    intlLocale: 'zh-CN',
    status: 'planned',
    searchTerms: ['chinese', 'simplified', 'mandarin', '中文', '简体', 'zh'],
  },
  {
    id: 'zh-Hant',
    nativeName: '繁體中文',
    englishName: 'Chinese (Traditional)',
    flag: '🇹🇼',
    intlLocale: 'zh-TW',
    status: 'planned',
    searchTerms: ['chinese', 'traditional', '繁體', 'taiwan', 'zh-tw'],
  },
];

export const LOCALE_BY_ID: Record<string, LocaleDefinition> = Object.fromEntries(
  LOCALE_REGISTRY.map(l => [l.id, l]),
);

/** Locales shown in onboarding + settings (must have translation packs). */
export function getReadyLocales(): LocaleDefinition[] {
  return LOCALE_REGISTRY.filter(l => l.status === 'ready');
}

export function getReadyLocaleIds(): string[] {
  return getReadyLocales().map(l => l.id);
}

export function isReadyLocale(id: string): boolean {
  return LOCALE_BY_ID[id]?.status === 'ready';
}

export function matchesLocaleSearch(locale: LocaleDefinition, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  const hay = [
    locale.nativeName,
    locale.englishName,
    locale.id,
    ...locale.searchTerms,
  ]
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}
