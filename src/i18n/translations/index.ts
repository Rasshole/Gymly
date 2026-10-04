import type {AppLanguage} from '../types';
import {FALLBACK_LANGUAGE, LANGUAGE_MODULE_IDS, hasTranslationModule} from '../types';
import {deepMergeDict} from '../deepMergeDict';

type Pack = Record<string, unknown>;

/**
 * Lazy pack loaders — Metro still bundles every locale (static require paths),
 * but Hermes only evaluates a pack when first requested.
 *
 * Eager static `import` of all 29 packs (~3MB source) blocked first paint on device
 * Debug builds (embedded jsbundle) for minutes. Do not revert to top-level imports.
 */
const PACK_LOADERS: Record<AppLanguage, () => Pack> = {
  da: () => require('./da').default,
  en: () => require('./en').default,
  sv: () => require('./sv').default,
  nb: () => require('./nb').default,
  de: () => require('./de').default,
  fr: () => require('./fr').default,
  es: () => require('./es').default,
  nl: () => require('./nl').default,
  it: () => require('./it').default,
  pl: () => require('./pl').default,
  pt: () => require('./pt').default,
  ko: () => require('./ko').default,
  ro: () => require('./ro').default,
  ja: () => require('./ja').default,
  'zh-Hans': () => require('./zh-Hans').default,
  'zh-Hant': () => require('./zh-Hant').default,
  tr: () => require('./tr').default,
  cs: () => require('./cs').default,
  el: () => require('./el').default,
  hu: () => require('./hu').default,
  vi: () => require('./vi').default,
  fi: () => require('./fi').default,
  uk: () => require('./uk').default,
  id: () => require('./id').default,
  th: () => require('./th').default,
  ar: () => require('./ar').default,
  he: () => require('./he').default,
  hi: () => require('./hi').default,
  ms: () => require('./ms').default,
};

const packCache: Partial<Record<AppLanguage, Pack>> = {};

function loadPack(lang: AppLanguage): Pack {
  const cached = packCache[lang];
  if (cached) {
    return cached;
  }
  const loader = PACK_LOADERS[lang];
  const pack = loader ? loader() : PACK_LOADERS[FALLBACK_LANGUAGE]();
  packCache[lang] = pack;
  return pack;
}

/**
 * Installed translation packs keyed by locale id.
 * Access is lazy — reading a key loads that pack once.
 * Picker visibility still requires localeRegistry status === 'ready'.
 */
export const TRANSLATION_MODULES: Record<AppLanguage, Pack> = new Proxy(
  {} as Record<AppLanguage, Pack>,
  {
    get(_target, prop: string | symbol) {
      if (typeof prop !== 'string' || !hasTranslationModule(prop)) {
        return undefined;
      }
      return loadPack(prop);
    },
    has(_target, prop: string | symbol) {
      return typeof prop === 'string' && hasTranslationModule(prop);
    },
    ownKeys() {
      return [...LANGUAGE_MODULE_IDS];
    },
    getOwnPropertyDescriptor(_target, prop: string | symbol) {
      if (typeof prop !== 'string' || !hasTranslationModule(prop)) {
        return undefined;
      }
      return {
        configurable: true,
        enumerable: true,
        get: () => loadPack(prop),
      };
    },
  },
);

export const translations = TRANSLATION_MODULES;

export function listInstalledTranslationIds(): AppLanguage[] {
  return [...LANGUAGE_MODULE_IDS];
}

export function getTranslationModule(
  lang: string,
): Record<string, unknown> | null {
  if (!hasTranslationModule(lang)) {
    return null;
  }
  return loadPack(lang);
}

/** Preload a locale pack (e.g. after first paint). Safe to call repeatedly. */
export function preloadTranslationModule(lang: string): void {
  if (hasTranslationModule(lang)) {
    loadPack(lang);
  }
}

export function getTranslations(lang: AppLanguage): Record<string, unknown> {
  const base = loadPack(FALLBACK_LANGUAGE);
  if (lang === FALLBACK_LANGUAGE) {
    return base;
  }
  const overlay = hasTranslationModule(lang)
    ? loadPack(lang)
    : loadPack(FALLBACK_LANGUAGE);
  return deepMergeDict(base, overlay);
}

export function getFallbackTranslations(): Record<string, unknown> {
  return loadPack(FALLBACK_LANGUAGE);
}

/** Test/helper: which packs have been evaluated so far. */
export function listLoadedTranslationIds(): AppLanguage[] {
  return (Object.keys(packCache) as AppLanguage[]).filter(
    id => packCache[id] != null,
  );
}
