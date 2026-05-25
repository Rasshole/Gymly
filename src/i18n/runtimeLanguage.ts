import type {AppLanguage} from './types';
import {getTranslations} from './translations';
import {createTranslator} from './translate';

let currentLanguage: AppLanguage = 'da';
let runtimeT = createTranslator(getTranslations('da'));

export function setRuntimeLanguage(lang: AppLanguage): void {
  currentLanguage = lang;
  runtimeT = createTranslator(getTranslations(lang));
}

export function getRuntimeLanguage(): AppLanguage {
  return currentLanguage;
}

/** Translate outside React (uses last language from LanguageProvider). */
export function rt(path: string, params?: Record<string, string | number>): string {
  return runtimeT(path, params);
}
