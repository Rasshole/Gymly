/**
 * RTL layout prep for future Arabic / Hebrew locales.
 *
 * Phase 2: do NOT call forceRTL / flip layout. Keep metadata only.
 * Prefer `start`/`end` / `marginStart` / `paddingEnd` in new UI.
 */

import {LOCALE_BY_ID} from './localeRegistry';

const RTL_LOCALE_IDS = new Set(['ar', 'he']);

export function isRtlLanguage(lang: string): boolean {
  return Boolean(LOCALE_BY_ID[lang]?.rtl) || RTL_LOCALE_IDS.has(lang);
}

/**
 * Phase 2 no-op: RTL locales stay planned/non-selectable.
 * When an RTL locale becomes ready, wire I18nManager here (may require reload).
 */
export function applyLayoutDirectionForLanguage(_lang: string): void {
  // Intentionally empty in Phase 2 (no RTL activation).
}
