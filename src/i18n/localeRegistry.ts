/**
 * Global locale registry — single source of truth for language picker metadata.
 * Only locales with status `ready`, a translation module, and a passing coverage
 * gate appear in the UI. Add a pack + set `ready` to ship a language (no picker rewrite).
 */

export type LocaleStatus = 'ready' | 'partial' | 'planned';

/**
 * Exercise display-name policy (generic — not per-language runtime hacks).
 * - FULLY_LOCALIZED: coverage gate requires overrides for (nearly) all library ids
 * - CANONICAL_GYM_ENGLISH_ALLOWED: English gym names OK; overrides optional
 */
export type ExerciseNamePolicy =
  | 'FULLY_LOCALIZED'
  | 'CANONICAL_GYM_ENGLISH_ALLOWED';

export type LocaleDefinition = {
  /** BCP-47 language code used in AsyncStorage / AppLanguage */
  id: string;
  /** Native endonym (Dansk, Deutsch, …) */
  nativeName: string;
  /** English name for search / secondary label */
  englishName: string;
  /** Intl / date-fns locale tag */
  intlLocale: string;
  status: LocaleStatus;
  /** Search aliases (native + english + common spellings) */
  searchTerms: string[];
  /** Right-to-left script (architecture only — not activated in Phase 2) */
  rtl?: boolean;
  /** How exercise library names are treated for the public quality gate */
  exerciseNamePolicy: ExerciseNamePolicy;
  /**
   * @deprecated Prefer nativeName; kept optional for migration. Not used as primary UI.
   */
  flag?: string;
};

/**
 * Catalog of current + future Gymly locales.
 * `ready` = public/selectable after module + coverage gate.
 * `partial` = incomplete (must not appear in picker).
 * `planned` = metadata only; no public activation yet.
 */
export const LOCALE_REGISTRY: LocaleDefinition[] = [
  {
    id: 'da',
    nativeName: 'Dansk',
    englishName: 'Danish',
    intlLocale: 'da-DK',
    status: 'ready',
    searchTerms: ['dansk', 'danish', 'da', 'dk'],
    exerciseNamePolicy: 'CANONICAL_GYM_ENGLISH_ALLOWED',
  },
  {
    id: 'en',
    nativeName: 'English',
    englishName: 'English',
    intlLocale: 'en-US',
    status: 'ready',
    searchTerms: ['english', 'engelsk', 'en', 'uk', 'us'],
    exerciseNamePolicy: 'CANONICAL_GYM_ENGLISH_ALLOWED',
  },
  {
    id: 'sv',
    nativeName: 'Svenska',
    englishName: 'Swedish',
    intlLocale: 'sv-SE',
    status: 'ready',
    searchTerms: ['svenska', 'swedish', 'sv', 'se'],
    exerciseNamePolicy: 'FULLY_LOCALIZED',
  },
  {
    id: 'nb',
    nativeName: 'Norsk',
    englishName: 'Norwegian',
    intlLocale: 'nb-NO',
    status: 'ready',
    searchTerms: ['norsk', 'norwegian', 'bokmål', 'bokmal', 'nb', 'no'],
    exerciseNamePolicy: 'FULLY_LOCALIZED',
  },
  // —— Phase 3 Batch 1 (planned / non-selectable) ——
  {
    id: 'de',
    nativeName: 'Deutsch',
    englishName: 'German',
    intlLocale: 'de-DE',
    status: 'ready',
    searchTerms: ['deutsch', 'german', 'tysk', 'de'],
    exerciseNamePolicy: 'CANONICAL_GYM_ENGLISH_ALLOWED',
  },
  {
    id: 'fr',
    nativeName: 'Français',
    englishName: 'French',
    intlLocale: 'fr-FR',
    status: 'ready',
    searchTerms: ['français', 'francais', 'french', 'fransk', 'fr'],
    exerciseNamePolicy: 'CANONICAL_GYM_ENGLISH_ALLOWED',
  },
  {
    id: 'es',
    nativeName: 'Español',
    englishName: 'Spanish',
    intlLocale: 'es-ES',
    status: 'ready',
    searchTerms: ['español', 'espanol', 'spanish', 'spansk', 'es'],
    exerciseNamePolicy: 'CANONICAL_GYM_ENGLISH_ALLOWED',
  },
  {
    id: 'it',
    nativeName: 'Italiano',
    englishName: 'Italian',
    intlLocale: 'it-IT',
    status: 'ready',
    searchTerms: ['italiano', 'italian', 'italiensk', 'it'],
    exerciseNamePolicy: 'CANONICAL_GYM_ENGLISH_ALLOWED',
  },
  {
    id: 'nl',
    nativeName: 'Nederlands',
    englishName: 'Dutch',
    intlLocale: 'nl-NL',
    status: 'ready',
    searchTerms: ['nederlands', 'dutch', 'hollandsk', 'nl'],
    exerciseNamePolicy: 'CANONICAL_GYM_ENGLISH_ALLOWED',
  },
  {
    id: 'pt',
    nativeName: 'Português',
    englishName: 'Portuguese',
    intlLocale: 'pt-PT',
    status: 'ready',
    searchTerms: ['português', 'portugues', 'portuguese', 'portugisisk', 'pt'],
    exerciseNamePolicy: 'CANONICAL_GYM_ENGLISH_ALLOWED',
  },
  {
    id: 'pl',
    nativeName: 'Polski',
    englishName: 'Polish',
    intlLocale: 'pl-PL',
    status: 'ready',
    searchTerms: ['polski', 'polish', 'polsk', 'pl'],
    exerciseNamePolicy: 'CANONICAL_GYM_ENGLISH_ALLOWED',
  },
  {
    id: 'fi',
    nativeName: 'Suomi',
    englishName: 'Finnish',
    intlLocale: 'fi-FI',
    status: 'ready',
    searchTerms: ['suomi', 'finnish', 'finsk', 'fi'],
    exerciseNamePolicy: 'CANONICAL_GYM_ENGLISH_ALLOWED',
  },
  {
    id: 'pt-BR',
    nativeName: 'Português (Brasil)',
    englishName: 'Portuguese (Brazil)',
    intlLocale: 'pt-BR',
    status: 'planned',
    searchTerms: ['português', 'brazil', 'brasil', 'brazilian', 'pt-br'],
    exerciseNamePolicy: 'CANONICAL_GYM_ENGLISH_ALLOWED',
  },
  {
    id: 'tr',
    nativeName: 'Türkçe',
    englishName: 'Turkish',
    intlLocale: 'tr-TR',
    status: 'ready',
    searchTerms: ['türkçe', 'turkce', 'turkish', 'tyrkisk', 'tr'],
    exerciseNamePolicy: 'CANONICAL_GYM_ENGLISH_ALLOWED',
  },
  {
    id: 'uk',
    nativeName: 'Українська',
    englishName: 'Ukrainian',
    intlLocale: 'uk-UA',
    status: 'ready',
    searchTerms: ['українська', 'ukrainian', 'ukrainsk', 'uk'],
    exerciseNamePolicy: 'CANONICAL_GYM_ENGLISH_ALLOWED',
  },
  {
    id: 'cs',
    nativeName: 'Čeština',
    englishName: 'Czech',
    intlLocale: 'cs-CZ',
    status: 'ready',
    searchTerms: ['čeština', 'czech', 'tjekkisk', 'cs'],
    exerciseNamePolicy: 'CANONICAL_GYM_ENGLISH_ALLOWED',
  },
  {
    id: 'ro',
    nativeName: 'Română',
    englishName: 'Romanian',
    intlLocale: 'ro-RO',
    status: 'ready',
    searchTerms: ['română', 'romanian', 'rumænsk', 'ro'],
    exerciseNamePolicy: 'CANONICAL_GYM_ENGLISH_ALLOWED',
  },
  {
    id: 'hu',
    nativeName: 'Magyar',
    englishName: 'Hungarian',
    intlLocale: 'hu-HU',
    status: 'ready',
    searchTerms: ['magyar', 'hungarian', 'ungarsk', 'hu'],
    exerciseNamePolicy: 'CANONICAL_GYM_ENGLISH_ALLOWED',
  },
  {
    id: 'el',
    nativeName: 'Ελληνικά',
    englishName: 'Greek',
    intlLocale: 'el-GR',
    status: 'ready',
    searchTerms: ['ελληνικά', 'greek', 'græsk', 'el'],
    exerciseNamePolicy: 'CANONICAL_GYM_ENGLISH_ALLOWED',
  },
  // RTL — planned only; do not activate without layout pass
  {
    id: 'ar',
    nativeName: 'العربية',
    englishName: 'Arabic',
    intlLocale: 'ar-SA',
    status: 'planned',
    rtl: true,
    searchTerms: ['arabic', 'arabisk', 'العربية', 'ar'],
    exerciseNamePolicy: 'CANONICAL_GYM_ENGLISH_ALLOWED',
  },
  {
    id: 'he',
    nativeName: 'עברית',
    englishName: 'Hebrew',
    intlLocale: 'he-IL',
    status: 'planned',
    rtl: true,
    searchTerms: ['hebrew', 'hebraisk', 'עברית', 'he'],
    exerciseNamePolicy: 'CANONICAL_GYM_ENGLISH_ALLOWED',
  },
  {
    id: 'ja',
    nativeName: '日本語',
    englishName: 'Japanese',
    intlLocale: 'ja-JP',
    status: 'ready',
    searchTerms: ['japanese', 'japansk', '日本語', 'ja'],
    exerciseNamePolicy: 'CANONICAL_GYM_ENGLISH_ALLOWED',
  },
  {
    id: 'ko',
    nativeName: '한국어',
    englishName: 'Korean',
    intlLocale: 'ko-KR',
    status: 'ready',
    searchTerms: ['korean', 'koreansk', '한국어', 'ko'],
    exerciseNamePolicy: 'CANONICAL_GYM_ENGLISH_ALLOWED',
  },
  {
    id: 'zh-Hans',
    nativeName: '简体中文',
    englishName: 'Chinese (Simplified)',
    intlLocale: 'zh-CN',
    status: 'ready',
    searchTerms: ['chinese', 'simplified', 'mandarin', '中文', '简体', 'zh'],
    exerciseNamePolicy: 'CANONICAL_GYM_ENGLISH_ALLOWED',
  },
  {
    id: 'zh-Hant',
    nativeName: '繁體中文',
    englishName: 'Chinese (Traditional)',
    intlLocale: 'zh-TW',
    status: 'ready',
    searchTerms: ['chinese', 'traditional', '繁體', 'taiwan', 'zh-tw'],
    exerciseNamePolicy: 'CANONICAL_GYM_ENGLISH_ALLOWED',
  },
  {
    id: 'hi',
    nativeName: 'हिन्दी',
    englishName: 'Hindi',
    intlLocale: 'hi-IN',
    status: 'ready',
    searchTerms: ['hindi', 'हिन्दी', 'hi'],
    exerciseNamePolicy: 'CANONICAL_GYM_ENGLISH_ALLOWED',
  },
  {
    id: 'id',
    nativeName: 'Bahasa Indonesia',
    englishName: 'Indonesian',
    intlLocale: 'id-ID',
    status: 'ready',
    searchTerms: ['indonesian', 'bahasa', 'indonesia', 'id'],
    exerciseNamePolicy: 'CANONICAL_GYM_ENGLISH_ALLOWED',
  },
  {
    id: 'ms',
    nativeName: 'Bahasa Melayu',
    englishName: 'Malay',
    intlLocale: 'ms-MY',
    status: 'ready',
    searchTerms: ['malay', 'melayu', 'bahasa melayu', 'ms'],
    exerciseNamePolicy: 'CANONICAL_GYM_ENGLISH_ALLOWED',
  },
  {
    id: 'vi',
    nativeName: 'Tiếng Việt',
    englishName: 'Vietnamese',
    intlLocale: 'vi-VN',
    status: 'ready',
    searchTerms: ['vietnamese', 'tiếng việt', 'viet', 'vi'],
    exerciseNamePolicy: 'CANONICAL_GYM_ENGLISH_ALLOWED',
  },
  {
    id: 'th',
    nativeName: 'ไทย',
    englishName: 'Thai',
    intlLocale: 'th-TH',
    status: 'ready',
    searchTerms: ['thai', 'ไทย', 'th'],
    exerciseNamePolicy: 'CANONICAL_GYM_ENGLISH_ALLOWED',
  },
];

export const LOCALE_BY_ID: Record<string, LocaleDefinition> = Object.fromEntries(
  LOCALE_REGISTRY.map(l => [l.id, l]),
);

/** Locales marked ready in registry (module + gate still required for picker). */
export function getReadyLocales(): LocaleDefinition[] {
  return LOCALE_REGISTRY.filter(l => l.status === 'ready');
}

export function getReadyLocaleIds(): string[] {
  return getReadyLocales().map(l => l.id);
}

export function isReadyLocale(id: string): boolean {
  return LOCALE_BY_ID[id]?.status === 'ready';
}

export function getExerciseNamePolicy(id: string): ExerciseNamePolicy {
  return LOCALE_BY_ID[id]?.exerciseNamePolicy ?? 'CANONICAL_GYM_ENGLISH_ALLOWED';
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

/** Alphabetical by native display name (stable for 4…50+ locales). */
export function sortLocalesByNativeName(
  locales: LocaleDefinition[],
): LocaleDefinition[] {
  return [...locales].sort((a, b) =>
    a.nativeName.localeCompare(b.nativeName, 'en', {sensitivity: 'base'}),
  );
}
