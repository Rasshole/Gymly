import type {AppLanguage} from '../types';
import {FALLBACK_LANGUAGE} from '../types';
import {deepMergeDict} from '../deepMergeDict';
import da from './da';
import en from './en';
import sv from './sv';
import nb from './nb';

export const translations = {da, en, sv, nb} as const;

/**
 * Resolve dictionary for a language with English as master base.
 * Overlay locale strings win; missing keys come from English.
 */
export function getTranslations(lang: AppLanguage): Record<string, unknown> {
  const base = translations[FALLBACK_LANGUAGE] as unknown as Record<string, unknown>;
  if (lang === FALLBACK_LANGUAGE) {
    return base;
  }
  const overlay = (translations[lang] ?? translations.da) as unknown as Record<
    string,
    unknown
  >;
  return deepMergeDict(base, overlay);
}

export function getFallbackTranslations(): Record<string, unknown> {
  return translations[FALLBACK_LANGUAGE] as unknown as Record<string, unknown>;
}
