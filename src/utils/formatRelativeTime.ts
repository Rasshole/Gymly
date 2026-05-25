/**
 * formatRelativeTime – shared date formatting (locale-aware)
 */

import type {AppLanguage} from '@/i18n/types';
import {getTranslations} from '@/i18n/translations';
import {getIntlLocale} from '@/i18n/locales';

function toValidDate(date: Date | string | number | null | undefined): Date | null {
  if (date == null) {
    return null;
  }
  const d = date instanceof Date ? date : new Date(date);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function formatRelativeTime(
  date: Date | string | number | null | undefined,
  language: AppLanguage = 'da',
): string {
  const parsed = toValidDate(date);
  if (!parsed) {
    return '—';
  }
  const tr = getTranslations(language).common;
  const diff = Date.now() - parsed.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) {
    return tr.now;
  }
  if (mins < 60) {
    return tr.minutesAgo.replace('{{count}}', String(mins));
  }
  if (hours < 24) {
    const key = hours === 1 ? 'hoursAgo_one' : 'hoursAgo_other';
    const template = tr[key as keyof typeof tr] as string;
    return template.replace('{{count}}', String(hours));
  }
  if (days === 1) {
    return tr.yesterday;
  }
  if (days < 7) {
    const key = days === 1 ? 'daysAgo_one' : 'daysAgo_other';
    const template = tr[key as keyof typeof tr] as string;
    return template.replace('{{count}}', String(days));
  }
  return parsed.toLocaleDateString(getIntlLocale(language));
}
