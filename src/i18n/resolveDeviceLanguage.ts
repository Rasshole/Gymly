import type {AppLanguage, SelectableLanguage} from './types';
import {
  SELECTABLE_LANGUAGES,
  coerceToSelectableLanguage,
  normalizeLanguageTag,
} from './types';
import {LOCALE_BY_ID, getReadyLocales} from './localeRegistry';

/**
 * Detect device language and map to a ready Gymly locale.
 * Unsupported system languages → English.
 *
 * Normalization:
 * - nb / nb-NO → nb
 * - no / no-NO → nb (Bokmål; product decision)
 * - nn / nn-NO → not mapped (falls through to English until Nynorsk exists)
 */
export function resolveDeviceLanguage(): SelectableLanguage {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale ?? '';
    const normalized = normalizeLanguageTag(locale);
    const tag = normalized ?? locale.split(/[-_]/)[0]?.toLowerCase();

    const ready = getReadyLocales();
    const match = ready.find(
      l =>
        l.id === tag ||
        l.id.startsWith((tag ?? '') + '-') ||
        l.intlLocale.toLowerCase().startsWith(tag ?? ''),
    );
    if (match && (SELECTABLE_LANGUAGES as string[]).includes(match.id)) {
      return match.id as SelectableLanguage;
    }
    if (tag && LOCALE_BY_ID[tag] && isReadySelectable(tag)) {
      return tag as SelectableLanguage;
    }
  } catch {
    /* ignore */
  }
  return 'en';
}

function isReadySelectable(id: string): boolean {
  return (SELECTABLE_LANGUAGES as string[]).includes(id);
}

/** Map stored / legacy codes to an active UI language. */
export function toSelectableLanguage(lang: AppLanguage | string): SelectableLanguage {
  return coerceToSelectableLanguage(lang);
}

export function getRecommendedLocaleId(): SelectableLanguage {
  return resolveDeviceLanguage();
}
