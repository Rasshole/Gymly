import type {AppLanguage} from '../types';
import da from './da';
import en from './en';
import sv from './sv';

export const translations = {da, en, sv} as const;

export function getTranslations(lang: AppLanguage) {
  return translations[lang] ?? translations.da;
}
