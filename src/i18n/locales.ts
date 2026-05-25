import {da, enUS, sv} from 'date-fns/locale';
import type {Locale} from 'date-fns';
import type {AppLanguage} from './types';

const DATE_FNS_LOCALES: Record<AppLanguage, Locale> = {
  da,
  en: enUS,
  sv,
};

const INTL_LOCALES: Record<AppLanguage, string> = {
  da: 'da-DK',
  en: 'en-US',
  sv: 'sv-SE',
};

export function getDateFnsLocale(lang: AppLanguage): Locale {
  return DATE_FNS_LOCALES[lang] ?? da;
}

export function getIntlLocale(lang: AppLanguage): string {
  return INTL_LOCALES[lang] ?? 'da-DK';
}
