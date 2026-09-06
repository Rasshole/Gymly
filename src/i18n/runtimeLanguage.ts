import type {AppLanguage} from './types';
import {FALLBACK_LANGUAGE} from './types';
import {getTranslations, getFallbackTranslations} from './translations';
import {createTranslator} from './translate';

let currentLanguage: AppLanguage = FALLBACK_LANGUAGE;
let runtimeT = createTranslator(
  getTranslations(FALLBACK_LANGUAGE),
  getFallbackTranslations(),
);

export function setRuntimeLanguage(lang: AppLanguage): void {
  currentLanguage = lang;
  runtimeT = createTranslator(getTranslations(lang), getFallbackTranslations());
}

export function getRuntimeLanguage(): AppLanguage {
  return currentLanguage;
}

/** Translate outside React (uses last language from LanguageProvider). */
export function rt(path: string, params?: Record<string, string | number>): string {
  return runtimeT(path, params);
}
