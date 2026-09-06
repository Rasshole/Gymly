/**
 * RTL layout prep for future Arabic / Hebrew locales.
 * Does not force RTL until a ready RTL locale is selectable.
 * Prefer `start`/`end` / `marginStart` / `paddingEnd` in new UI.
 */

import {I18nManager} from 'react-native';
import {LOCALE_BY_ID} from './localeRegistry';

const RTL_LOCALE_IDS = new Set(['ar', 'he']);

export function isRtlLanguage(lang: string): boolean {
  return RTL_LOCALE_IDS.has(lang) || LOCALE_BY_ID[lang]?.id === 'ar';
}

/**
 * Align RN layout direction with the active language when an RTL pack ships.
 * Until then this is a no-op (keeps LTR). Changing allowRTL/forceRTL may
 * require an app reload on some platforms — call only when status becomes ready.
 */
export function applyLayoutDirectionForLanguage(lang: string): void {
  const wantRtl = isRtlLanguage(lang) && LOCALE_BY_ID[lang]?.status === 'ready';
  if (I18nManager.isRTL === wantRtl) {
    return;
  }
  // Safe prep: allow RTL app-wide without flipping until a ready RTL locale is active.
  I18nManager.allowRTL(true);
  if (wantRtl) {
    I18nManager.forceRTL(true);
  }
}
