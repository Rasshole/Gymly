import type {AppLanguage, SelectableLanguage} from './types';
import {
  SELECTABLE_LANGUAGES,
  coerceToSelectableLanguage,
  hasTranslationModule,
  normalizeLanguageTag,
} from './types';
import {LOCALE_BY_ID, getReadyLocales, isReadyLocale} from './localeRegistry';

/**
 * Map one device/system locale tag to a ready Gymly language.
 * Returns null when the tag is empty or not a selectable locale.
 * English is a real match for `en` / `en-US`, not a silent fallback.
 */
export function matchSelectableLanguage(
  deviceLocale: string | null | undefined,
): SelectableLanguage | null {
  try {
    const locale = (deviceLocale ?? '').trim();
    if (!locale) {
      return null;
    }
    const normalized = normalizeLanguageTag(locale);
    const tag = normalized ?? locale.split(/[-_]/)[0]?.toLowerCase();

    if (tag && isReadySelectable(tag)) {
      return tag as SelectableLanguage;
    }

    const ready = getReadyLocales();
    const match = ready.find(
      l =>
        l.id === tag ||
        l.id.toLowerCase() === (tag ?? '') ||
        l.intlLocale.toLowerCase() === locale.toLowerCase() ||
        l.intlLocale.toLowerCase().startsWith((tag ?? '') + '-'),
    );
    if (match && isReadySelectable(match.id)) {
      return match.id as SelectableLanguage;
    }

    if (tag && LOCALE_BY_ID[tag] && isReadySelectable(tag)) {
      return tag as SelectableLanguage;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Map a device/system locale tag to a ready + installed Gymly language.
 * Planned/partial locales never win — unsupported → English.
 *
 * Examples:
 * - da / da-DK → da
 * - sv / sv-SE → sv
 * - nb / no → nb
 * - de while planned → en
 */
export function resolveLanguageFromTag(
  deviceLocale: string | null | undefined,
): SelectableLanguage {
  return matchSelectableLanguage(deviceLocale) ?? 'en';
}

/**
 * First supported language in the phone's ordered preference list.
 * Unsupported tags are skipped. English is the fallback when none match.
 */
export function resolveLanguageFromPreferences(
  preferences: readonly (string | null | undefined)[],
): SelectableLanguage {
  for (const preference of preferences) {
    const matched = matchSelectableLanguage(preference);
    if (matched) {
      return matched;
    }
  }
  return 'en';
}

/**
 * Saved choice wins. Otherwise the first supported device preference, then English.
 */
export function resolveStartupLanguage(
  stored: string | null | undefined,
  preferences: readonly (string | null | undefined)[],
): SelectableLanguage {
  const saved = stored?.trim();
  if (saved) {
    return coerceToSelectableLanguage(saved);
  }
  return resolveLanguageFromPreferences(preferences);
}

function isReadySelectable(id: string): boolean {
  return (
    isReadyLocale(id) &&
    hasTranslationModule(id) &&
    (SELECTABLE_LANGUAGES as string[]).includes(id)
  );
}

/**
 * Detect device language and map to a ready Gymly locale.
 * Unsupported system languages → English.
 */
export function resolveDeviceLanguage(): SelectableLanguage {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale ?? '';
    return resolveLanguageFromTag(locale);
  } catch {
    return 'en';
  }
}

/** Map stored / legacy codes to an active UI language. */
export function toSelectableLanguage(lang: AppLanguage | string): SelectableLanguage {
  return coerceToSelectableLanguage(lang);
}

/** @deprecated Prefer resolveDeviceLanguage — kept for call sites. */
export function getRecommendedLocaleId(): SelectableLanguage {
  return resolveDeviceLanguage();
}
