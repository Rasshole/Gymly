import {
  ar,
  cs,
  da,
  de,
  el,
  enUS,
  es,
  fi,
  fr,
  he,
  hi,
  hu,
  id,
  it,
  ja,
  ko,
  ms,
  nb,
  nl,
  pl,
  pt,
  ro,
  sv,
  th,
  tr,
  uk,
  vi,
  zhCN,
  zhTW,
} from 'date-fns/locale';
import type {Locale} from 'date-fns';
import {LOCALE_BY_ID} from './localeRegistry';
import type {AppLanguage} from './types';
import {FALLBACK_LANGUAGE} from './types';

/** date-fns map by Gymly locale id — unknown → enUS */
const DATE_FNS_LOCALES: Record<string, Locale> = {
  da,
  en: enUS,
  sv,
  nb,
  de,
  fr,
  es,
  nl,
  it,
  pl,
  pt,
  fi,
  cs,
  ro,
  hu,
  el,
  tr,
  uk,
  ja,
  ko,
  'zh-Hans': zhCN,
  'zh-Hant': zhTW,
  hi,
  id,
  ms,
  vi,
  th,
  ar,
  he,
};

export function getDateFnsLocale(lang: AppLanguage | string): Locale {
  return DATE_FNS_LOCALES[lang] ?? enUS;
}

export function getIntlLocale(lang: AppLanguage | string): string {
  return (
    LOCALE_BY_ID[lang]?.intlLocale ??
    (lang === FALLBACK_LANGUAGE ? 'en-US' : undefined) ??
    'en-US'
  );
}
