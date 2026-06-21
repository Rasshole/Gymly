import type {AppLanguage, SelectableLanguage} from './types';
import {SELECTABLE_LANGUAGES} from './types';

export function resolveDeviceLanguage(): SelectableLanguage {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale ?? '';
    const tag = locale.split(/[-_]/)[0]?.toLowerCase();
    if (tag === 'da' || tag === 'en') {
      return tag;
    }
  } catch {
    /* ignore */
  }
  return 'en';
}

/** Map stored / legacy codes to an active UI language (sv hidden until launch). */
export function toSelectableLanguage(lang: AppLanguage): SelectableLanguage {
  if (lang === 'en') {
    return 'en';
  }
  return 'da';
}
