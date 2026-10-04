/**
 * Pure helpers for which locales appear in the language picker.
 * Ready registry status ∩ installed translation module, sorted by native name.
 */

import {
  getReadyLocales,
  sortLocalesByNativeName,
  type LocaleDefinition,
} from './localeRegistry';
import {hasTranslationModule} from './types';

export function getSelectablePickerLocales(): LocaleDefinition[] {
  return sortLocalesByNativeName(
    getReadyLocales().filter(l => hasTranslationModule(l.id)),
  );
}

export function listVisiblePickerLocaleIds(): string[] {
  return getSelectablePickerLocales().map(l => l.id);
}
